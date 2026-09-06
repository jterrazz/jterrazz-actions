# jterrazz-actions

Shared CI and CD for the `@jterrazz` ecosystem: reusable GitHub Actions
workflows and composite actions that every project calls to validate and
release. A repository carries two workflow files and a `Makefile` exposing
`build`, `lint` and `test`, and inherits the whole pipeline from here. Change
the pipeline once, every repository gets it.

It inherits a warm build with it: CI caches `.artifacts/`, the one root the
ecosystem keeps build and tool state under, and a repository that writes there
compiles incrementally between runs — no other opt-in.

## Documentation

[docs/README.md](docs/README.md) is the map of the corpus. Start at
[docs/03-wiring-a-repo.md](docs/03-wiring-a-repo.md) to set a repository up,
[docs/01-workflows.md](docs/01-workflows.md) for what each workflow does, and
[docs/04-secrets.md](docs/04-secrets.md) for what it needs to be given.

The cluster these workflows deploy to is
[jterrazz/jterrazz-infrastructure](https://github.com/jterrazz/jterrazz-infrastructure).
