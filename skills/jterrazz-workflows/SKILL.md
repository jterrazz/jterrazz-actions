---
name: jterrazz-workflows
description: Shared CI/CD workflows for jterrazz projects — validate, release-npm, release-docker, release-go. Activates when setting up GitHub Actions, configuring CI pipelines, or debugging workflow failures.
---

# jterrazz-workflows

Reusable GitHub Actions workflows and composite actions for all @jterrazz repos.

## Shared workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `validate.yaml` | Build + lint + test | Push / PR to main |
| `release-npm.yaml` | Validate → npm publish with OIDC provenance | GitHub Release |
| `release-docker.yaml` | Validate → Docker build → Helm deploy | Push to main / v* tags |
| `release-go.yaml` | Build Go binaries → GitHub Release | v* tags |

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
