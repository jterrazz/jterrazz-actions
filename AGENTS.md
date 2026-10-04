# Agent brief

The pipeline every `@jterrazz` repository inherits. This file routes; the
knowledge is in [docs/](docs/README.md).

## Mental model

Five reusable workflows in `.github/workflows/`, built from four composite
actions in `actions/`. A consuming repository owns two workflow files and a
`Makefile` with `build`, `lint` and `test` — that make interface is the whole
contract on the caller's side, whatever its toolchain.

Nothing here is deployed. Editing a workflow changes every repository's next
run, on `@main`, with no version to bump and no release to cut: callers pin the
branch, not a tag.

## Where to read

| Question                                                    | Chapter                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| What does each workflow do, and what does it take?          | [docs/01-architecture.md](docs/01-architecture.md)          |
| I am changing a workflow or an action                       | [docs/02-developing.md](docs/02-developing.md)              |
| How do I prove a change before a consumer feels it?          | [docs/03-testing.md](docs/03-testing.md)                    |
| I am setting a repository up to use these                    | [docs/05-wiring-a-repo.md](docs/05-wiring-a-repo.md)        |
| Which secrets, and where do they come from?                  | [docs/06-secrets.md](docs/06-secrets.md)                    |

The chart a Docker release deploys through, and the manifest an app owns, are
`jterrazz-infrastructure`'s documentation, not this repository's.
