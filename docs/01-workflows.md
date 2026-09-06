# The reusable workflows

Five workflows, called by every `@jterrazz` repository. One validates; four
release, and each of them validates first.

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
| `node-version` | `""`    | Installs Node with an npm cache. Empty skips the setup entirely.             |
| `browsers`     | `false` | Provisions Playwright chromium before Test, cached by the version read from the caller's `package-lock.json`. For suites that render pages through `specification.website()` (`@jterrazz/test`). |

## release-docker.yaml

Validates, builds and pushes the image, deploys it with Helm, then prunes old
tags. Its inputs beyond `image-name` (required) are `node-version`, `browsers`,
`timeout` (default `5m`, cert-manager headroom on a first deploy),
`manifest` (default `.infrastructure/application.yaml`), `dockerfile`,
`build-args` and `keep-latest-versions` (default `3`). It requires the two
Infisical secrets — [04-secrets.md](04-secrets.md).

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

## release-npm.yaml

Validates, then publishes with `npm publish --access public --provenance`. The
caller's workflow file must be named `release.yaml`: that name is what npm
provenance is configured against on the package.

## release-go.yaml

Validates with the same three make targets, then cross-compiles. `binary-name`
is required; `build-path` defaults to `.`, `go-version` to `1.24`, and
`targets` to `darwin/arm64,darwin/amd64,linux/arm64,linux/amd64`.

## release-tauri.yaml

Builds a Tauri app on a matrix of macOS and Linux targets, signs and notarizes
it when the Apple secrets are present, and attaches the bundles to a GitHub
Release. `project-path` (the directory containing `src-tauri/`) is required;
`node-version` defaults to `22`.

An app that ships a binary sidecar inside the bundle sets `go-version` and
`pre-build-script`. The script runs after Node and Go are installed and before
`tauri-action`, so whatever it produces is on disk in time for the bundler to
pick it up through the sidecar config.
