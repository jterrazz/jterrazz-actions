# jterrazz-actions

Shared CI and CD for the `@jterrazz` ecosystem: reusable GitHub Actions
workflows and composite actions that every project calls to validate and
release.

## Why

Every repository would otherwise copy the same pipeline and drift from it. A
repository here carries two workflow files and a `Makefile` exposing `build`,
`lint` and `test`, and inherits the whole pipeline; change it once, every
repository gets it.

It inherits a warm build with it: CI caches `.artifacts/`, the one root the
ecosystem keeps build and tool state under, and a repository that writes there
compiles incrementally between runs, with no other opt-in.

## Thirty seconds

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
```

That runs `make build`, `make lint` and `make test` on every push and pull
request. Releases are one more file each: npm, Docker to the cluster, and
Go.

## Documentation

[docs/README.md](docs/README.md) is the map of the corpus. Start at
[wire-a-repository](docs/guides/wire-a-repository.md) to set a repository up,
[architecture](docs/concepts/architecture.md) for what each workflow does, and
[secrets](docs/reference/secrets.md) for what it needs to be given.

The cluster these workflows deploy to is
[jterrazz/jterrazz-infrastructure](https://github.com/jterrazz/jterrazz-infrastructure).
