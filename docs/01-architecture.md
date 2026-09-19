# Architecture

The shape of this repository is its catalogue: five reusable workflows in
`.github/workflows/`, called by every `@jterrazz` repository, and the four
composite actions in `actions/` that `release-docker.yaml` is built from. One
workflow validates; four release, and each of them validates first.

| Workflow                | Purpose                                                              | Trigger in the caller       |
| ----------------------- | -------------------------------------------------------------------- | --------------------------- |
| `validate.yaml`         | `make build` + `make lint` + `make test`                             | push / PR to `main`         |
| `release-docker.yaml`   | Validate → Docker build → Helm deploy to the cluster → prune old tags | push to `main`, `v*` tags   |
| `release-npm.yaml`      | Validate → `npm publish` with OIDC provenance                        | GitHub Release              |
| `release-go.yaml`       | Cross-compile Go binaries → GitHub Release                           | `v*` tags                   |
| `release-tauri.yaml`    | Build, sign and notarize a Tauri desktop app (macOS, Linux) → GitHub Release | `v*` tags            |

## validate.yaml

Runs `make build`, `make lint`, `make test` in that order — the universal CI
interface, which is all a repo has to expose whatever its toolchain.

| Input          | Default | Effect                                                                       |
| -------------- | ------- | ---------------------------------------------------------------------------- |
| `node-version` | `'24'`  | Installs Node with an npm cache. An explicit empty string skips the setup entirely; a caller that passes a version keeps it. |
| `browsers`     | `false` | Provisions Playwright chromium before Test, cached by the version read from whichever lockfile the caller has — `package-lock.json`, `bun.lock`, or `pnpm-lock.yaml`, tried in that order. For suites that render pages through `specification.website()` (`@jterrazz/test`). |

### The `.artifacts` cache

The three gates run against a restored `.artifacts/`, the single root every
`@jterrazz` repository writes build and tool state under — `.artifacts/tsc/`
for the incremental buildinfo, then `vitest/`, `knip/`, `next/`, `cargo/`,
`playwright/`. One entry warms every toolchain in the repo at once, so a
compile survives between runs instead of starting cold on every push.

A consumer does nothing to benefit but point its tools there —
[05-wiring-a-repo.md](05-wiring-a-repo.md). A repository that writes nothing
under `.artifacts/` is unaffected: the restore misses, the save finds no path
and logs a warning, and neither fails the job.

Two things are deliberately not cached. `dist/` stays out, because a release
must ship what the commit says and not what a cache remembers. So does
`node_modules/`, which is the package manager's concern and is already
handled by `setup-node`'s `cache: npm`.

Every run saves under `artifacts-<os>-<lockfile hash>-<ref name>-<run id>` —
the hash covering the lockfile of every toolchain the estate uses
(`package-lock.json`, `bun.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`).
A cache key is immutable once written, and a buildinfo changes with every
commit, so one entry per run is what keeps the cache tracking HEAD rather
than freezing at a branch's first green.

Restoring is therefore all prefix match, in three widening steps: the same
branch's most recent run, then the same lockfile on any branch, then the OS
alone. That is how a fresh branch, and a `v*` tag, start from the tree `main`
last left.

Restore and save are separate steps so the save can run on `always()`: a red
run still compiled, and its retry is what most wants a warm tree. It needs no
cache-hit guard, since a key carrying the run id is new by construction.

The cost is one entry per run against the repository's 10 GB budget, which
GitHub evicts LRU — so the oldest runs fall off on their own, and what
survives is the recent history that a restore would actually pick. Entries
are small: tool state only, no `dist/`, no `node_modules/`.

## release-docker.yaml

Validates, builds and pushes the image, deploys it with Helm, then prunes old
tags. Its inputs beyond `image-name` (required) are `node-version`, `browsers`,
`timeout` (default `5m`, cert-manager headroom on a first deploy),
`manifest` (default `.infrastructure/application.yaml`), `dockerfile`,
`build-args` and `keep-latest-versions` (default `3`). It requires the two
Infisical secrets — [06-secrets.md](06-secrets.md).

Which environments a run deploys is resolved from the manifest's
`environments` block:

- **No environment declares a `tag:`** — a `v*` tag deploys `prod` with that
  image tag; a push to `main` deploys `staging` with `latest`. This is the
  legacy branch, and it is why the infrastructure side calls `tag:` mandatory:
  without it a push silently leaves prod stale.
- **Environments declare a `tag:`** — a `v*` tag deploys every environment
  whose `tag:` is `next`, with the released tag; a push to `main` deploys every
  environment whose `tag:` is `main`, with `latest`. A manual
  `workflow_dispatch` additionally deploys the environments pinned to a literal
  tag, at that tag.

A monorepo app points `dockerfile:` and `manifest:` into its own directory and
scopes its push trigger with `paths:`, keeping the build context at the repo
root.

### The composite actions it is built from

`release-docker.yaml` is the one workflow with steps of its own beyond
`validate.yaml`: four composite actions, each a directory under `actions/`
holding one `action.yaml`.

| Action                                                | Does                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [`actions/infra-connect`](../actions/infra-connect)     | Fetches the secrets from Infisical, joins Tailscale as `tag:ci`, logs in to the container registry |
| [`actions/docker-build`](../actions/docker-build)       | Builds and pushes the image with Buildx                                                            |
| [`actions/docker-deploy`](../actions/docker-deploy)     | Deploys with `helm upgrade --install` against the shared app chart                                 |
| [`actions/docker-cleanup`](../actions/docker-cleanup)   | Prunes old `v*` tags and runs registry garbage collection                                          |

**infra-connect.** One step for the three connections a deploy needs. It
fetches from Infisical project `jterrazz`, environment `prod`, path
`/jterrazz-actions` (all three overridable), which exports the connectivity
secrets as environment variables for the steps that follow.

**docker-build.** Buildx with `network=host`, so buildkit resolves the
registry's `*.ts.net` name through the runner's Tailscale resolver. Without it
the push NXDOMAINs on the public CNAME chain.

**docker-deploy.** `helm upgrade --install <env>-<image-name>` against
`oci://registry.internal.jterrazz.com/charts/app`, with the caller's manifest
as the values file, once per resolved deployment.

It passes `meta.repository=${{ github.repository }}`, which through a reusable
workflow is still the calling repository. The app chart stamps it on the
Deployment as `app.jterrazz.com/repository`, and that annotation is the only
place the cluster records which repository rebuilds a workload:
`jterrazz-infrastructure`'s `make redeploy-apps` reads it off the live
Deployments instead of holding a list that goes stale. An app that stops
passing it drops out of the fleet rebuild.

Any `*.json` file in a `dashboards/` directory beside the manifest is passed to
the chart as `spec.dashboards.<name>`.

The Helm timeout defaults to `5m`, which is headroom for cert-manager on a
first deploy that introduces a new Certificate: DNS-01 against Cloudflare
usually takes about a minute but queues when several apps roll out at once.
Steady-state upgrades finish in seconds, so the higher default costs nothing.

**docker-cleanup.** Deletes old `v*` registry tags beyond
`keep-latest-versions`, over the registry's HTTP API with a netrc file rather
than a `curl -u` argument — an argument sits in `ps` for anything else on the
runner to read, for as long as the step runs.

## release-npm.yaml

Validates, then publishes with `npm publish --access public --provenance`. The
caller's workflow file must be named `release.yaml`: that name is what npm
provenance is configured against on the package.

## release-go.yaml

Validates with the same three make targets, then cross-compiles. `binary-name`
is required; `build-path` defaults to `.`, `go-version` to `1.24`, and
`targets` to `darwin/arm64,darwin/amd64,linux/arm64,linux/amd64`.

It spells the gates out in its own job instead of calling `validate.yaml`, and
so carries its own copy of the `.artifacts` cache. The two are meant to stay
identical: a change to one is a change to both.

## release-tauri.yaml

Builds a Tauri app on a matrix of macOS and Linux targets, signs and notarizes
it when the Apple secrets are present, and attaches the bundles to a GitHub
Release. `project-path` (the directory containing `src-tauri/`) is required;
`node-version` defaults to `22`. It is the one workflow that runs no `make`
gate, so it carries no `.artifacts` cache either.

An app that ships a binary sidecar inside the bundle sets `go-version` and
`pre-build-script`. The script runs after Node and Go are installed and before
`tauri-action`, so whatever it produces is on disk in time for the bundler to
pick it up through the sidecar config.

## Where `release-docker.yaml` deploys to

The cluster is [jterrazz/jterrazz-infrastructure](https://github.com/jterrazz/jterrazz-infrastructure).
What an app repository owes it, and the `application.yaml` schema
`docker-deploy` renders, are that repository's documentation, not this one's.
