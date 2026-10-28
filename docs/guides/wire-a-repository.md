# Wiring a repository

A consuming repository carries a `Makefile` and two workflow files, and
inherits the whole build, test and release pipeline from here. Change the
pipeline once, every repository gets it.

Four rules hold everywhere:

- The `Makefile` exposes `build`, `lint` and `test`, whatever the toolchain.
  A `mutation` target, where it has one, runs after them in the same job,
  on a push or a pull request; an npm release skips it, and a Docker release
  runs it when its caller passes `mutation: true`.
- Node.js 24, except where a workflow's own default says otherwise.
- An npm release caller is named `release.yaml`, because npm provenance is
  configured against that filename. Never skip validation: every release
  workflow runs it first.
- No secret is stored: a releasing job grants
  `permissions: { contents: read, id-token: write }`, and every service takes
  that OIDC token ([secrets](../reference/secrets.md)).
- Build and tool state goes under `.artifacts/<tool>/`, gitignored. That is
  the whole opt-in to CI caching; see below.

## Caching your build

CI restores and saves `.artifacts/` around the three gates
([the cache](../concepts/artifacts-cache.md)). A repository benefits by writing its
tool state there and nowhere else:

| Tool       | Where to point it                                                   |
| ---------- | --------------------------------------------------------------------- |
| tsc        | `tsBuildInfoFile: ".artifacts/tsc/tsconfig.tsbuildinfo"`             |
| vitest     | `cacheDir: '.artifacts/vitest'`                                      |
| knip       | `"cacheLocation": ".artifacts/knip"`                                 |
| Next.js    | `distDir: '.artifacts/next'`                                         |
| cargo      | `CARGO_TARGET_DIR=.artifacts/cargo`                                  |
| playwright | `outputDir: '.artifacts/playwright'`                                 |

`dist/` is not one of them: it stays where it is, and CI never caches it:
a release ships what the commit says. Add `.artifacts/` to `.gitignore`;
nothing under it is a source. A repository that opts out keeps cold runs and
the workflow does not notice.

## npm package

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  validate:
    uses: jterrazz/studio-actions/.github/workflows/validate.yaml@main
    with: { node-version: "24" }
    # browsers: true provisions Playwright chromium for specification.website() suites
```

```yaml
# .github/workflows/release.yaml
name: Release
on:
  release: { types: [created] }
permissions: { contents: read, id-token: write }
jobs:
  release:
    uses: jterrazz/studio-actions/.github/workflows/release-npm.yaml@main
    with: { node-version: "24" }
    secrets: inherit
```

## Docker app deployed to the cluster

The validate caller runs on pull requests only: a push to `main` is the
release, and the release validates it once, mutation included, through
`mutation: true`.

```yaml
# .github/workflows/validate.yaml
name: Validate
on:
  pull_request: { branches: [main] }
jobs:
  validate:
    uses: jterrazz/studio-actions/.github/workflows/validate.yaml@main
    with: { node-version: "24" }
```

```yaml
# .github/workflows/build-and-deploy.yaml
name: Build and Deploy
on:
  push:
    branches: [main]
    tags: ["v*"]
  # The daily rebuild: an untouched app still takes its base image's patches.
  schedule: [{ cron: "0 4 * * *" }]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
jobs:
  build-and-deploy:
    permissions: { contents: read, id-token: write }
    uses: jterrazz/studio-actions/.github/workflows/release-docker.yaml@main
    with:
      image-name: my-app
      node-version: "24"
      mutation: true
```

`image-name` must equal the manifest's `metadata.name`, or the deploy refuses.
The `schedule:` rebuilds `main` daily, so a floating base tag (`node:24-alpine`)
takes its patches though no commit lands, within a day of their release, and
every image is scanned again against that day's vulnerability database; an exact one moves through the
Renovate preset beside the workflows:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>jterrazz/studio-actions//renovate/apps"]
}
```

[`renovate/apps.json`](../../renovate/apps.json) says what it moves and what
it merges by itself.
The app also owns `.infrastructure/application.yaml`, the manifest the app
chart renders, with a `deploy:` on every environment (`push` or `release`), or
at the root of a `scope: shared` app. Its caller triggers on `tags: ['v*']`
only when an environment is `deploy: release`. Its schema, and everything the cluster
promises in return, are `studio-infrastructure`'s
[deploy contract](https://github.com/jterrazz/studio-infrastructure/blob/main/docs/reference/deploy-contract.md).

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
    uses: jterrazz/studio-actions/.github/workflows/release-go.yaml@main
    with: { binary-name: workstation, build-path: ./src/cmd/workstation }
```
