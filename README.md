# jterrazz-actions

Shared CI/CD for the **@jterrazz** ecosystem — reusable GitHub Actions workflows
and composite actions used by every project to validate and release.

The goal: an app repo carries **two workflow files and a `Makefile`**, and inherits
the entire build → test → publish/deploy pipeline from here. Change the pipeline
once, every repo gets it.

## Reusable workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| [`validate.yaml`](.github/workflows/validate.yaml) | `make build` + `make lint` + `make test` | Push / PR to `main` |
| [`release-docker.yaml`](.github/workflows/release-docker.yaml) | Validate → Docker build → Helm deploy to k3s → prune old tags | Push to `main` / `v*` tags |
| [`release-npm.yaml`](.github/workflows/release-npm.yaml) | Validate → `npm publish` with OIDC provenance | GitHub Release |
| [`release-go.yaml`](.github/workflows/release-go.yaml) | Cross-compile Go binaries → GitHub Release | `v*` tags |
| [`release-tauri.yaml`](.github/workflows/release-tauri.yaml) | Build + sign + notarize a Tauri desktop app (macOS / Linux) → GitHub Release | `v*` tags |

## Composite actions

| Action | Purpose |
|--------|---------|
| [`actions/infra-connect`](actions/infra-connect) | Fetch secrets from Infisical, join Tailscale (`tag:ci`), log in to the container registry |
| [`actions/docker-build`](actions/docker-build) | Build + push the Docker image (Buildx, `network=host` so Buildkit resolves `*.ts.net`) |
| [`actions/docker-deploy`](actions/docker-deploy) | Deploy via `helm upgrade --install` using the shared app chart |
| [`actions/docker-cleanup`](actions/docker-cleanup) | Prune old `v*` tags and run registry GC |

## Wiring up a repo

Every consuming repo needs a `Makefile` exposing `build`, `lint`, `test` — the
universal CI interface regardless of toolchain — plus **two** workflow files.

### npm package

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  validate:
    uses: jterrazz/jterrazz-actions/.github/workflows/validate.yaml@main
    with: { node-version: "24" }
    # browsers: true — provisions Playwright chromium before Test (cached,
    # version read from the caller's package-lock). For repos whose specs
    # render pages via specification.website() (@jterrazz/test).
```

```yaml
# .github/workflows/release.yaml
name: Release
on:
  release: { types: [created] }
permissions: { contents: read, id-token: write }
jobs:
  release:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-npm.yaml@main
    with: { node-version: "24" }
    secrets: inherit
```

### Docker app (deployed to the k3s cluster)

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
jobs:
  release:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-docker.yaml@main
    with:
      image-name: my-app
      node-version: "24"
    secrets:
      INFISICAL_CLIENT_ID: ${{ secrets.INFISICAL_CLIENT_ID }}
      INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
```

### Go tool

```yaml
jobs:
  release:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-go.yaml@main
    with: { binary-name: j, build-path: ./src/cmd/j }
```

### Tauri desktop app

```yaml
jobs:
  desktop:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-tauri.yaml@main
    with: { project-path: apps/observatory }
    secrets: inherit
```

`release-tauri.yaml` also accepts an optional `go-version` + `pre-build-script`
for apps that ship a binary sidecar inside the bundle (e.g. a Go CLI). The script
runs after Node + Go are installed but before `tauri-action`, so the binary is on
disk in time for the bundler. See [`skills/jterrazz-workflows/SKILL.md`](skills/jterrazz-workflows/SKILL.md)
for the full Tauri secret list and the openssl 3.x `.p12` `-legacy` gotcha.

## Secrets

Deploy-time secrets live in **Infisical** (project `jterrazz`, env `prod`) and are
pulled by `infra-connect` from `/jterrazz-actions`. Each consuming repo only sets two
GitHub secrets — the Infisical machine-identity credentials:

| GitHub secret | Purpose |
|---------------|---------|
| `INFISICAL_CLIENT_ID` | Infisical universal-auth client ID (read-only, scoped to `/jterrazz-actions`) |
| `INFISICAL_CLIENT_SECRET` | Its secret |

`infra-connect` then loads the connectivity secrets from `/jterrazz-actions` as env vars:
`TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`,
`DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD`, and (for deploys)
`KUBECONFIG_BASE64`.

## Related

- [`jterrazz/jterrazz-infra`](https://github.com/jterrazz/jterrazz-infra) — the k3s cluster these workflows deploy to.
- [`skills/jterrazz-workflows/SKILL.md`](skills/jterrazz-workflows/SKILL.md) — the agent-facing skill with per-project recipes and gotchas.
