# studio-actions

Shared CI and CD for the `@jterrazz` ecosystem: the reusable GitHub Actions
workflows every repository calls to check, deploy and publish, and the
composite actions they are built from.

## Why

Every repository would otherwise copy the same pipeline and drift from it. A
repository here carries a `Makefile` exposing `build`, `lint` and `test`, and
one small file per family it uses: Check, Deploy, Publish, Watch. Change the
pipeline once, every repository gets it, on its next run.

A Deploy reads as one answer: Plan, Check beside Build, Scan, Deploy and
Verify per environment, then a summary saying what deployed where, at which
digest, whether it answers, and what the checks and the image scan found.

## Thirty seconds

```yaml
# .github/workflows/check.yaml
name: Check
on:
    push: { branches: [main] }
    pull_request: { branches: [main] }
jobs:
    check:
        name: Check
        uses: jterrazz/studio-actions/.github/workflows/check.yaml@main
```

That installs, then runs `make build`, `make lint` and `make test` (and
`make mutation` over the change) on every push and pull request.

## Working on it

`make lint` checks the manual, the comments and the names; `make test` runs
the unit tests of the plan and the summary (Node alone, nothing to install).
Self-test proves the actions on fixtures at the change's own commit
([test](docs/guides/test.md)).

## Documentation

[docs/README.md](docs/README.md) is the map. Start at
[wire-a-repository](docs/guides/wire-a-repository.md) to set a repository
up, [architecture](docs/concepts/architecture.md) for what each workflow and
action does, and [test](docs/guides/test.md) for how a change is proven
before it reaches `@main`.

The cluster a Deploy deploys to is
[jterrazz/studio-infrastructure](https://github.com/jterrazz/studio-infrastructure).
