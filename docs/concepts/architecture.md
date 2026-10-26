# Architecture

The shape of this repository is its catalogue: four reusable workflows in
`.github/workflows/`, called by every `@jterrazz` repository, and the
composite actions in `actions/` they are built from: four for
`release-docker.yaml`, `mutation-since` for `validate.yaml`, and
`artifacts-cache`, which `validate.yaml` and `release-go.yaml` share. One workflow
validates; three release, and each of them validates first.

| Workflow                | Purpose                                                              | Trigger in the caller       |
| ----------------------- | -------------------------------------------------------------------- | --------------------------- |
| `validate.yaml`         | `make build` + `make lint` + `make test` (+ `make mutation`)       | push / PR to `main`         |
| `release-docker.yaml`   | Validate (mutation if asked), Docker build, Helm deploy to the cluster, then prune old tags | push to `main`, `v*` tags   |
| `release-npm.yaml`      | Validate (no mutation), then `npm publish` with OIDC provenance                    | GitHub Release              |
| `release-go.yaml`       | Cross-compile Go binaries into a GitHub Release                      | `v*` tags                   |

## validate.yaml

Runs `make build`, `make lint`, `make test` in that order: the universal CI
interface, which is all a repo has to expose whatever its toolchain. A
`Makefile` that also has a `mutation` target runs it last: for an
`@jterrazz/typescript` project, `typescript mutation`, which fails on any
mutant a test runs and none detects: the module tests over the sources they
test, and the whole suite over the lines the push or the pull request
changed that no module test runs.

### The mutation range

The step hands it that range, which
[`actions/mutation-since`](../../actions/mutation-since) resolves, as
`TYPESCRIPT_MUTATION_SINCE` (the pull request's base, else the commit the
push started from), which is why validate checks out the whole history. The
toolchain refuses a commit the clone does not hold, so when the push
started from one it cannot reach (a force-push dropped it, or the zero
commit of a branch's first push), the step measures from the fork point
with the default branch, or else the parent commit, and says which; an
event that carries neither (a schedule, a manual run) leaves the variable
blank, and the working tree is measured against `HEAD`.

A change that touches only Markdown, or only the manual under the root
`docs/`, gives mutation nothing to measure, so the step reads the diff over
that same range and skips, saying so. An event with no commit to diff from
always runs it.

Under CI the toolchain runs mutation cold: it reads no report the restored
`.artifacts/` carries, so every run re-measures every mutant the module tests
reach, and a large package's run takes hours. That is why a release skips it:
`release-npm.yaml` calls validate with `mutation: false`, since the push or
the pull request that brought the commit gated it already, and
`release-docker.yaml` forwards its own `mutation` input, `false` by default. A
Docker app whose push to `main` is its release passes `mutation: true`, so
that push is validated once, mutation included, instead of by a validate
caller and then again by the release.

### Which run a newer one cancels

A newer run cancels the one it makes useless, and only that one: validate
holds a concurrency group per caller workflow and ref for a pull request,
whose next run gates the same base, and for a push to a branch other than
the default. A push to the default branch is never cancelled, since its
mutation range (the commit before it to this one) is measured by no later
run, and neither is a release (`mutation: false`, a tag, a release event).

Those queue in a group of their commit's SHA instead, so a release's validate
waits for the push's validate of the same commit and then restores the
verdict it saved ([artifacts-cache.md](artifacts-cache.md)) instead of
proving the tree a second time. GitHub keeps one pending run per group and
cancels an older pending one, which is safe while a commit has at most two
such runs, its push and its release.

The group name opens with `validate-` so it never equals a group the
caller's own workflow holds, which GitHub resolves by cancelling one of the
two.

### Inputs

| Input          | Default | Effect                                                                       |
| -------------- | ------- | ---------------------------------------------------------------------------- |
| `node-version` | `'24'`  | Installs Node with an npm cache. An explicit empty string skips the setup entirely; a caller that passes a version keeps it. |
| `browsers`     | `false` | Provisions Playwright chromium before Test, cached by the version read from whichever lockfile the caller has: `package-lock.json`, `bun.lock`, or `pnpm-lock.yaml`, tried in that order, then its system packages, each attempt bounded at 2 minutes and retried up to 3 times. For suites that render pages through `specification.website()` (`@jterrazz/test`). |
| `mutation`     | `true`  | Runs the `Makefile`'s `mutation` target after Test, where it has one. `release-npm.yaml` passes `false`; `release-docker.yaml` forwards its own. |

The `.artifacts/` cache the three gates run against is its own concept: [artifacts-cache.md](artifacts-cache.md).

## release-docker.yaml

Validates, builds and pushes the image, deploys it with Helm, then prunes old
tags. Its inputs beyond `image-name` (required) are `node-version`, `browsers`,
`mutation` (default `false`, forwarded to validate), `timeout` (default `5m`, cert-manager headroom on a first deploy),
`manifest` (default `.infrastructure/application.yaml`) and `dockerfile`. It
requires the two
Infisical secrets: [secrets.md](../reference/secrets.md).

Which environments a run deploys is resolved from the manifest's
`environments` block:

- **No environment declares a `tag:`**: a `v*` tag deploys `prod` with that
  image tag; a push to `main` deploys `staging` with `latest`. This is the
  legacy branch, and it is why the infrastructure side calls `tag:` mandatory:
  without it a push silently leaves prod stale.
- **Environments declare a `tag:`**: a `v*` tag deploys every environment
  whose `tag:` is `next`, with the released tag; a push to `main` deploys every
  environment whose `tag:` is `main`, with `latest`. A manual
  `workflow_dispatch` additionally deploys the environments pinned to a literal
  tag, at that tag.

A monorepo app points `dockerfile:` and `manifest:` into its own directory and
scopes its push trigger with `paths:`, keeping the build context at the repo
root.

### The composite actions it is built from

`release-docker.yaml` is the one workflow with steps of its own beyond
`validate.yaml`: five composite actions, each a directory under `actions/`
holding one `action.yaml`.

| Action                                                | Does                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [`actions/infra-connect`](../../actions/infra-connect)     | Fetches the secrets from Infisical, joins Tailscale as `tag:ci`, logs in to the container registry |
| [`actions/cluster-connect`](../../actions/cluster-connect) | Points kubectl and helm at the cluster as the job's GitHub OIDC identity                           |
| [`actions/docker-build`](../../actions/docker-build)       | Builds and pushes the image with Buildx                                                            |
| [`actions/docker-deploy`](../../actions/docker-deploy)     | Deploys with `helm upgrade --install` against the shared app chart                                 |
| [`actions/docker-cleanup`](../../actions/docker-cleanup)   | Prunes old `v*` tags and the node's unreferenced containerd content                                |

**infra-connect.** One step for the three connections a deploy needs, with
the job's GitHub OIDC token alone. It reads the registry account from
Infisical project `studio-ci`, joins Tailscale through a trust credential,
resolves the registry's CNAME over the tailnet and pins it in `/etc/hosts`
(the runner's resolver sometimes never chases it), then logs in.

**cluster-connect.** Writes a kubeconfig whose user is an exec plugin minting
the job's OIDC token on demand, so a long `--wait` never outlives a token, and
exports `KUBECONFIG`. The CA is read from k3s' `/cacerts` over the tailnet, so
a repave changes nothing here. `docker-deploy` calls it, and so does
`studio-infrastructure`'s Smoke workflow.

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
`studio-infrastructure`'s `make redeploy-apps` reads it off the live
Deployments instead of holding a list that goes stale. An app that stops
passing it drops out of the fleet rebuild.

Any `*.json` file in a `dashboards/` directory beside the manifest is passed to
the chart as `spec.dashboards.<name>`.

The Helm timeout defaults to `5m`, which is headroom for cert-manager on a
first deploy that introduces a new Certificate: DNS-01 against Cloudflare
usually takes about a minute but queues when several apps roll out at once.
Steady-state upgrades finish in seconds, so the higher default costs nothing.

**docker-cleanup.** Deletes old `v*` registry tags beyond the newest
`keep-latest-versions` (default `3`), over the registry's HTTP API with a netrc file rather
than a `curl -u` argument, since an argument sits in `ps` for anything else on the
runner to read, for as long as the step runs.

It then prunes the node's unreferenced containerd content from a privileged
pod pinned to the `control-plane` node, and only warns when that fails, since
the release is deployed by then. It does not collect the registry's
garbage: the tags it deletes are swept by the infrastructure's weekly
`registry-gc` job, which skips itself while any upload is in flight, a guard
a collection inside a release could never pass.

## release-npm.yaml

Validates without mutation, then publishes with `npm publish --access public --provenance`. The
caller's workflow file must be named `release.yaml`: that name is what npm
provenance is configured against on the package.

The publish step is bounded at 4 minutes and the publish job at 15: when the
npm registry degrades, a publish hangs for minutes instead of failing.

## release-go.yaml

Validates with the same three make targets, then cross-compiles. `binary-name`
is required; `build-path` defaults to `.`, `go-version` to `1.24`, and
`targets` to `darwin/arm64,darwin/amd64,linux/arm64,linux/amd64`.

It spells the gates out in its own job instead of calling `validate.yaml`, and
shares the `.artifacts` cache with it through
[`actions/artifacts-cache`](../../actions/artifacts-cache).

## Where `release-docker.yaml` deploys to

The cluster is [jterrazz/studio-infrastructure](https://github.com/jterrazz/studio-infrastructure).
What an app repository owes it, and the `application.yaml` schema
`docker-deploy` renders, are that repository's documentation, not this one's.
