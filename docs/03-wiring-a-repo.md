# Wiring a repository

A consuming repository carries a `Makefile` and two workflow files, and
inherits the whole build, test and release pipeline from here. Change the
pipeline once, every repository gets it.

Three rules hold everywhere:

- The `Makefile` exposes `build`, `lint` and `test`, whatever the toolchain.
- Node.js 24, except where a workflow's own default says otherwise.
- The release caller is named `release.yaml`, because npm provenance is
  configured against that filename. Never skip validation: every release
  workflow runs it first.

## npm package

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
    # browsers: true — Playwright chromium for specification.website() suites
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

## Docker app deployed to the cluster

The validate caller adds `workflow_call:` to its triggers so the release
workflow can reuse it.

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  pull_request: { branches: [main] }
  workflow_call:
jobs:
  validate:
    uses: jterrazz/jterrazz-actions/.github/workflows/validate.yaml@main
    with: { node-version: "24" }
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
    uses: jterrazz/jterrazz-actions/.github/workflows/release-docker.yaml@main
    with:
      image-name: my-app
      node-version: "24"
    secrets:
      INFISICAL_CLIENT_ID: ${{ secrets.INFISICAL_CLIENT_ID }}
      INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
```

The app also owns `.infrastructure/application.yaml`, the manifest the app
chart renders. Its schema, and everything the cluster promises in return, are
`jterrazz-infrastructure`'s.

## Go tool

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions: { contents: write }
jobs:
  release:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-go.yaml@main
    with: { binary-name: j, build-path: ./src/cmd/j }
```

## Tauri desktop app

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions: { contents: write }
jobs:
  desktop:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-tauri.yaml@main
    with: { project-path: apps/observatory }
    secrets: inherit
```

With a sidecar binary in the bundle:

```yaml
jobs:
  desktop:
    uses: jterrazz/jterrazz-actions/.github/workflows/release-tauri.yaml@main
    with:
      project-path: apps/observatory
      go-version: "1.25"
      pre-build-script: |
        cd apps/cli && go build -o ../../bin/spwn ./cmd/spwn
    secrets: inherit
```
