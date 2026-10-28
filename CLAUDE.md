# Agent brief

The pipeline every `@jterrazz` repository inherits. This file routes; the
knowledge is in [docs/](docs/README.md).

## Mental model

Reusable workflows in `.github/workflows/`, one per family (Check, Deploy,
Publish), built from verb-object composite actions in `actions/`, whose logic
is in `scripts/`. A consuming repository owns one small file per family and
a `Makefile` with `build`, `lint` and `test`: that make interface is the
whole contract on the caller's side, whatever its toolchain.

`self-test.yaml` is this repository's own workflow: it runs `make lint`, the
unit tests, and every action by its `./` path on fixtures, so a change is
proven before `@main` reaches every caller. Callers pin the branch, not a
tag: there is no version to bump and no release to cut.

## Where to read

| Question                                                    | Chapter                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| What does each workflow and action do, and what does it take? | [docs/concepts/architecture.md](docs/concepts/architecture.md)   |
| What is each file, job and step named?                      | [docs/reference/naming.md](docs/reference/naming.md)             |
| I am changing a workflow, an action or a script             | [docs/guides/develop.md](docs/guides/develop.md)                 |
| How do I prove a change before a consumer feels it?         | [docs/guides/test.md](docs/guides/test.md)                       |
| I am setting a repository up to use these                   | [docs/guides/wire-a-repository.md](docs/guides/wire-a-repository.md) |
| Which secrets, and where do they come from?                 | [docs/reference/secrets.md](docs/reference/secrets.md)           |

The chart a Deploy deploys through, and the manifest an app owns, are
`studio-infrastructure`'s documentation, not this repository's.
