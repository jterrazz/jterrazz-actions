# Architecture

This repository is a catalogue: reusable workflows in `.github/workflows/`,
which every `@jterrazz` repository calls, and the composite actions in
`actions/` they are built from. A workflow is named after the intent of its
run, never after the tool it calls; an action is named verb-object, after
what it does. [Naming](../reference/naming.md) holds the rules.

## Four families

Every workflow a repository carries belongs to one of four families, the
same name in every repository.

| Family  | Caller file   | Runs on                                           | Shared workflow                                        |
| ------- | ------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Check   | `check.yaml`  | a pull request; a push to `main` for a library    | `check.yaml`                                           |
| Deploy  | `deploy.yaml` | a push to `main`, a `v*` tag, the daily rebuild   | `deploy-docker.yaml`                                   |
| Publish | `publish.yaml`, `release.yaml` for an npm package | a GitHub Release (npm) or a `v*` tag (Go) | `publish-npm.yaml`, `publish-go.yaml`                  |
| Watch   | `watch.yaml`  | a schedule                                        | none: a probe is the repository's own                  |

A Docker app has no Check on a push to `main`: its push is its release, and
Deploy checks that commit while it builds the image. A library's push to
`main` is checked by Check, and its Publish checks again.

## The Check

`actions/check` is the whole check, in one composite action, so that every
family runs the same one and no reusable workflow calls another. In order:
it installs the dependencies, then runs `make build`, `make lint`,
hadolint over the Dockerfile when there is one, `make test`, and
`make mutation` over the change. The `Makefile` is the whole contract on the
caller's side ([wiring a repository](../guides/wire-a-repository.md)).

Each option is an input, decided inside the action, so the job lists only
what ran: no skipped Playwright or mutation steps. Each pass is recorded
with its outcome and duration, and a pass the toolchain proved from its
cache ("nothing ran") is recorded as cached. Those records become the checks
table, written to the job's summary in a Check run and handed to the Summary
job in a Deploy run.

| Input          | Default        | Effect                                                                                     |
| -------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `node-version` | `24`           | Sets Node up with an npm cache; an empty string skips it                                   |
| `go-version`   | empty          | Sets Go up                                                                                 |
| `browsers`     | `false`        | Provisions Playwright chromium, cached by the version the lockfile names                   |
| `mutation`     | `true`         | Runs the `mutation` target, where the Makefile has one, over the change the event carries  |
| `dockerfile`   | `Dockerfile`   | The file hadolint reads, when it exists; warnings only for now                             |

**Install** is its own pass. A Makefile that installs through a stamp
(`node_modules/.install`, or a `node_modules` target) installs by that
rule, so the later `make build` finds the stamp fresh and never installs
twice; any other project installs from its lockfile (`npm ci`,
`bun install --frozen-lockfile`). npm's audit and funding notes are silenced
for the whole job: the image scan and Renovate's security lane own that.

**Mutation** measures the lines a push or a pull request changed, since the
commit the event started from, which is why the caller checks the whole
history out only when mutation runs. A change to Markdown or the root
`docs/` alone gives it nothing to measure, so it is recorded off with why.
A release, a schedule and a Deploy (unless the app asks with
`mutation: true`) leave it off: the push that brought the commit measured it.

**Concurrency.** A newer Check cancels a pull request's older run, or a
branch push's. A push to `main` is never cancelled: its mutation range is
measured by no later run, so it queues in a group of its own commit.

## The Deploy

`deploy-docker.yaml` builds an app's image and deploys it to the cluster
[jterrazz/studio-infrastructure](https://github.com/jterrazz/studio-infrastructure)
runs, through the shared app chart.

```text
Plan ─┬─ Check ──────────────────────┐
      └─ Build · sha-<7> ─ Scan ──────┴─ Deploy · <env> ─ Verify · <env> ─ Summary
```

- **Plan** reads the app's manifest (`.infrastructure/application.yaml`):
  each environment names `deploy: push` (every push to `main`) or
  `deploy: release` (a `v*` tag). The daily schedule rebuilds both: `main`'s
  HEAD for the `push` environments and the newest `v*` tag for the `release`
  ones, so a release environment takes its base image's patches though nobody
  tags. A shared app (`scope: shared`) deploys as the one environment
  `shared`. An environment naming neither value fails the run here.
- **Check** runs `actions/check` beside the build: the image builds while the
  tests run, and deploys only if both pass.
- **Build** pushes the image as `sha-<7>`, the commit it was built from, with
  its OCI labels, and records its digest, size and base.
- **Scan** reads that image with Trivy before anything deploys it.
- **Deploy · \<env\>** rolls it out with `helm upgrade --install`, by digest,
  one job per environment.
- **Verify · \<env\>** waits for the rollout, then probes every route as its
  `studio.jterrazz.com/smoke-*` annotations say. Only then does the alias
  (`latest`, or the `v*` tag) move onto the digest, so an image that failed
  its scan, rollout or probes is never `latest`. Old tags are pruned last.
- **Summary** renders the run's one answer, on success and on failure alike.

**Concurrency.** Deploys queue per app and environment and are never
cancelled; GitHub keeps the newest pending one, so a run waiting behind a
deploy gives way to a newer commit. A Verify that finds its namespace already
running a newer digest reports itself superseded and moves no alias.

| Input        | Default                            | Effect                                                         |
| ------------ | ---------------------------------- | -------------------------------------------------------------- |
| `image-name` | required                           | The image, the release and the manifest's `metadata.name`      |
| `manifest`   | `.infrastructure/application.yaml` | The app's manifest                                             |
| `dockerfile` | `Dockerfile`                       | Built with the repository root as context                      |
| `timeout`    | `5m`                               | Helm's wait, headroom for cert-manager on a first deploy       |
| `mutation`   | `false`                            | Mutation in Check, for an app whose push to `main` is its release |
| `node-version`, `browsers` | `24`, `false`        | Passed to Check                                                |

A monorepo app points `dockerfile:` and `manifest:` into its own directory
and scopes its push trigger with `paths:`; the build context stays the root.

### The summary

Every job writes its facts as a JSON report artifact (`plan`, `check`,
`build-<7>`, `scan-<7>`, `deploy-<env>`, `verify-<env>`), and Summary renders
them with the job results into the run's Markdown summary: a title (deployed
where, or blocked at which stage), the commit line, one row per environment
(image, digest, URL, state, the untouched ones too), the checks table, the
image (size against the one it replaces, base, findings, exceptions) and the
Trivy report, folded. When a `release` environment stayed behind, it says
which tag ships the commit. A failure names the stage that blocked and what
to do: the fixable CVEs for a scan, the failed passes for a check.
[`scripts/summary.mjs`](../../scripts/summary.mjs) is the renderer; its tests
pin the format.

### The scan

A **critical** vulnerability **with a published fix** blocks the deploy; a
critical with no fix and everything rated high
is reported only, since no rebuild could clear it. An exception lives in the
repository's `.trivyignore.yaml`, one entry per CVE with a `statement` and an
`expired_at`. Trivy and hadolint are binaries pinned by version and checksum,
not marketplace actions whose tags can be rewritten.

The gate is enforced since 2026-10-29. It shipped report-only the day
before, when three production images carried criticals, all in the lint
toolchain's Go binaries that npm kept as production dependencies through
optional peers; `@jterrazz/typescript` 12.1.0, `@jterrazz/intelligence` 9.0.1
and `@jterrazz/manifest` 0.6.0 took them out.

## The Publish

`publish-npm.yaml` checks the package (no mutation), then runs
`npm publish --access public --provenance` with the job's OIDC token: npm's
trusted publishing authenticates with it and provenance signs with it. npm
trusts one workflow file per package, by name, so a caller's file keeps the
name its trusted publisher names. The publish step is bounded at 4 minutes:
when the registry degrades, a publish hangs instead of failing.

`publish-go.yaml` checks with Go set up, then cross-compiles `binary-name`
from `build-path` for each `targets` pair into a GitHub Release.

## The actions

| Action                                                              | Does                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`check`](../../actions/check)                                      | The whole check, recorded as a checks table                                                  |
| [`plan-deploy`](../../actions/plan-deploy)                          | Resolves the builds and deployments of a Deploy run                                          |
| [`connect-infra`](../../actions/connect-infra)                      | Reads the registry account from Infisical, joins Tailscale, logs in to the registry          |
| [`connect-cluster`](../../actions/connect-cluster)                  | Points kubectl and helm at the cluster as the job's GitHub OIDC identity                     |
| [`build-image`](../../actions/build-image)                          | Builds and pushes `sha-<7>` with Buildx on the runner's tailnet                              |
| [`scan-image`](../../actions/scan-image)                            | Scans an image with Trivy                                                                    |
| [`deploy-app`](../../actions/deploy-app)                            | Creates the namespace the app owns, then `helm upgrade --install` by digest                  |
| [`verify-app`](../../actions/verify-app)                            | Waits for the rollout, probes the routes, moves the alias                                    |
| [`prune-images`](../../actions/prune-images)                        | Deletes old tags, keeping `latest`, three `v*` and five `sha-*` builds                       |
| [`write-summary`](../../actions/write-summary)                      | Gathers the reports and renders the summary                                                  |
| [`cache-artifacts`](../../actions/cache-artifacts)                  | The `.artifacts` cache, for a repository whose check is its own                              |
| [`resolve-mutation-range`](../../actions/resolve-mutation-range)    | The commit a change started from, for a repository whose check is its own                    |

An action's logic lives in [`scripts/`](../../scripts), which the action
reaches through its own path, so it is the same code a unit test runs. A few
facts behind the actions:

- **connect-infra** joins Tailscale through the trust credential for its ref
  (`main`, or a `v*` tag), then resolves the registry's CNAME over the
  tailnet and pins it in `/etc/hosts`: the runner's resolver sometimes never
  chases it.
- **build-image** runs Buildx with `network=host`, so buildkit resolves the
  registry's `*.ts.net` name through Tailscale; without it the push NXDOMAINs.
- **deploy-app** creates the namespace `<app>-<env>` (`<app>` for a shared
  app), labelled `studio.jterrazz.com/{tier,app,repository}` and its
  environment or scope, with the RoleBinding the repository acts through,
  before helm: the cluster's ownership policy reads both. It passes
  `meta.repository`, which the chart stamps on the Deployment, and
  `studio-infrastructure`'s `make redeploy-apps` reads it back. Every
  `dashboards/*.json` and `alerts/*.yaml` beside the manifest becomes a
  `spec.dashboards` or `spec.alerts` entry.
- **prune-images** keeps a recent `sha-*` build because another run may be
  about to deploy it, and deletes a digest only when no kept tag shares it.
  The registry's blobs are swept by the infrastructure's weekly `registry-gc`.

What the manifest holds, and what the cluster promises an app in return, are
`studio-infrastructure`'s
[deploy contract](https://github.com/jterrazz/studio-infrastructure/blob/main/docs/reference/deploy-contract.md).
