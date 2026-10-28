# Wiring a repository

A repository carries a `Makefile` and one small file per family it uses, and
inherits the whole pipeline from here: a change made once reaches every
repository.

Five rules hold everywhere:

- The `Makefile` exposes `build`, `lint` and `test`, whatever the toolchain.
  A `mutation` target, where there is one, runs after them. A
  `node_modules/.install` (or `node_modules`) target, where there is one, is
  how the check installs.
- Node.js 24 unless the caller says otherwise; `node-version: ''` skips it.
- No secret is stored: a deploying or publishing job grants
  `permissions: { contents: read, id-token: write }`, and every service takes
  that OIDC token ([secrets](../reference/secrets.md)).
- Build and tool state goes under `.artifacts/<tool>/`, gitignored: that is
  the whole opt-in to the CI cache ([the cache](../concepts/artifacts-cache.md)).
- The files and jobs are named as [Naming](../reference/naming.md) says.

## A library or a tool

```yaml
# .github/workflows/check.yaml
name: Check

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    check:
        name: Check
        uses: jterrazz/studio-actions/.github/workflows/check.yaml@main
        # with: { browsers: true } provisions chromium for specification.website() suites
```

An npm package adds its Publish, which a GitHub Release starts. It passes
the same inputs its Check passes, so the publish gate runs the suite the push
gate ran:

```yaml
# .github/workflows/publish.yaml
name: Publish
run-name: Publish ${{ github.event.release.tag_name }}

on:
    release:
        types: [created]

jobs:
    publish:
        name: Publish
        permissions:
            contents: read
            id-token: write
        uses: jterrazz/studio-actions/.github/workflows/publish-npm.yaml@main
```

npm's trusted publisher, configured once on npmjs.com, names this file. A Go
tool's Publish runs on `push: { tags: ['v*'] }` with `contents: write` and
calls `publish-go.yaml` with `binary-name` and `build-path`.

## A Docker app deployed to the cluster

Check runs on pull requests only: a push to `main` is the release, and
Deploy checks that commit beside the build.

```yaml
# .github/workflows/deploy.yaml
name: Deploy
run-name: Deploy ${{ github.ref_name }} · ${{ github.event_name == 'schedule' && 'daily rebuild' || github.event_name == 'workflow_dispatch' && format('manual run by {0}', github.triggering_actor) || format('push by {0}', github.triggering_actor) }}

on:
    push:
        branches: [main]
        tags: ['v*'] # only when an environment is `deploy: release`
    # value: the daily rebuild, so an untouched app still takes its base image's patches.
    schedule:
        - cron: '0 4 * * *'
    workflow_dispatch:

jobs:
    deploy:
        name: Deploy
        permissions:
            contents: read
            id-token: write
        uses: jterrazz/studio-actions/.github/workflows/deploy-docker.yaml@main
        with:
            image-name: my-app
```

`image-name` must equal the manifest's `metadata.name`, or the deploy
refuses. The app owns `.infrastructure/application.yaml`, with a `deploy:`
(`push` or `release`) on every environment, or at the root of a
`scope: shared` app; its schema is `studio-infrastructure`'s
[deploy contract](https://github.com/jterrazz/studio-infrastructure/blob/main/docs/reference/deploy-contract.md).
Each route's `smoke` block there is what Verify probes after a rollout.

Stagger the schedule's minute across apps. The daily rebuild takes a
floating base tag's patches (`node:24-alpine`) within a day; an exact one
moves through the Renovate preset beside the workflows:

```json
{
    "$schema": "https://docs.renovatebot.com/renovate-schema.json",
    "extends": ["github>jterrazz/studio-actions//renovate/apps"]
}
```

[`renovate/apps.json`](../../renovate/apps.json) says what it moves and what
it merges by itself.

## A probe of its own

A scheduled probe (an upstream drift, a platform contract) is `watch.yaml`,
named Watch, one job per probe. It is the repository's own: no shared
workflow serves it.

## Caching the build

CI restores and saves `.artifacts/` around the check. A repository benefits
by writing its tool state there and nowhere else:

| Tool       | Where to point it                                        |
| ---------- | -------------------------------------------------------- |
| tsc        | `tsBuildInfoFile: ".artifacts/tsc/tsconfig.tsbuildinfo"` |
| vitest     | `cacheDir: '.artifacts/vitest'`                          |
| knip       | `"cacheLocation": ".artifacts/knip"`                     |
| Next.js    | `distDir: '.artifacts/next'`                             |
| cargo      | `CARGO_TARGET_DIR=.artifacts/cargo`                      |
| playwright | `outputDir: '.artifacts/playwright'`                     |

`dist/` stays out: a release ships what the commit says.
