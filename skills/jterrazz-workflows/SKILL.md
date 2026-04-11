---
name: jterrazz-workflows
description: CI/CD for the @jterrazz ecosystem — defines how all projects validate and release. Shared GitHub Actions workflows. Activates when setting up CI, configuring pipelines, or debugging workflows.
---

# jterrazz-workflows

Part of the @jterrazz ecosystem. Defines how all projects validate and release.

Reusable GitHub Actions workflows and composite actions for all @jterrazz repos.

## Shared workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `validate.yaml` | Build + lint + test | Push / PR to main |
| `release-npm.yaml` | Validate → npm publish with OIDC provenance | GitHub Release |
| `release-docker.yaml` | Validate → Docker build → Helm deploy | Push to main / v* tags |
| `release-go.yaml` | Build Go binaries → GitHub Release | v* tags |
| `release-tauri.yaml` | Build + sign + notarize Tauri desktop app for macOS / Linux → GitHub Release | v* tags |

## Every repo needs exactly 2 workflow files

### For npm packages (package-*)

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  validate:
    uses: jterrazz/jterrazz-workflows/.github/workflows/validate.yaml@main
    with:
      node-version: "24"
```

```yaml
# .github/workflows/release.yaml
name: Release
on:
  release:
    types: [created]
permissions:
  contents: read
  id-token: write
jobs:
  release:
    uses: jterrazz/jterrazz-workflows/.github/workflows/release-npm.yaml@main
    with:
      node-version: "24"
    secrets: inherit
```

### For Docker apps (signews-*, etc.)

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  pull_request:
    branches: [main]
  workflow_call:
jobs:
  validate:
    uses: jterrazz/jterrazz-workflows/.github/workflows/validate.yaml@main
    with:
      node-version: "24"
```

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
    uses: jterrazz/jterrazz-workflows/.github/workflows/release-docker.yaml@main
    with:
      image-name: {app-name}
      node-version: "24"
    secrets:
      INFISICAL_CLIENT_ID: ${{ secrets.INFISICAL_CLIENT_ID }}
      INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
```

### For Go tools (jterrazz-studio)

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    uses: jterrazz/jterrazz-workflows/.github/workflows/release-go.yaml@main
    with:
      binary-name: j
      build-path: ./src/cmd/j
```

### For Tauri desktop apps (spwn)

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  desktop:
    uses: jterrazz/jterrazz-workflows/.github/workflows/release-tauri.yaml@main
    with:
      project-path: apps/observatory
    secrets: inherit
```

For projects that ship a binary sidecar inside the Tauri bundle (e.g.
spwn ships its Go CLI alongside the desktop app), the workflow accepts
an optional `pre-build-script` and `go-version`:

```yaml
jobs:
  desktop:
    uses: jterrazz/jterrazz-workflows/.github/workflows/release-tauri.yaml@main
    with:
      project-path: apps/observatory
      go-version: "1.25"
      pre-build-script: |
        cd apps/cli && go build -o ../../bin/spwn ./cmd/spwn
    secrets: inherit
```

The pre-build script runs after Node + Go are installed but before
`tauri-action`, so any binary it produces is on disk in time for the
Tauri bundler to pick it up via the sidecar config.

#### Tauri secrets the workflow consumes

All optional, all passed through `secrets: inherit`:

| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri auto-updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the above |
| `APPLE_CERTIFICATE` | Base64 of the Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used at `.p12` export time |
| `APPLE_SIGNING_IDENTITY` | The cert's CN, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password — **NOT** the real Apple ID password |
| `APPLE_TEAM_ID` | Apple Developer team ID |

If the Apple secrets are unset, the build still produces unsigned
DMGs. macOS users will see a "unverified developer" warning on first
launch.

#### ⚠️ openssl 3.x `.p12` gotcha

When generating the `.p12` for `APPLE_CERTIFICATE`, you **must** use
the `-legacy` flag:

```sh
openssl pkcs12 -export -legacy \
  -inkey signing.key \
  -in cert.pem \
  -out signing.p12 \
  -name "Developer ID Application"
```

Modern openssl 3.x defaults to PBKDF2 + AES which `security import` on
macOS can't read, and the failure mode is the misleading
`MAC verification failed (wrong password?)` error. The legacy flag
falls back to PBE-SHA1-3DES which every macOS understands.

## Composite actions

| Action | Purpose |
|--------|---------|
| `actions/infra-connect` | Connect to Infisical, Tailscale, and Docker registry |
| `actions/docker-build` | Build + push Docker image with Buildx caching |
| `actions/docker-deploy` | Deploy via Helm to K3s cluster |
| `actions/docker-cleanup` | Prune old tags + registry GC |

## Prerequisites

- **Makefile** with `build`, `lint`, `test` targets (required by validate)
- **npm provenance** configured on npmjs.com per package (for release-npm)
- **INFISICAL secrets** on GitHub repo (for release-docker)

## Always

- Use Node.js 24
- Caller workflow file must be named `release.yaml` (matches npm provenance config)
- Never skip validation — release workflows run validate first
