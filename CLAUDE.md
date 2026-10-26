# Agent brief

The pipeline every `@jterrazz` repository inherits. This file routes; the
knowledge is in [docs/](docs/README.md).

## Mental model

Four reusable workflows in `.github/workflows/`, built from six composite
actions in `actions/`. A consuming repository owns two workflow files and a
`Makefile` with `build`, `lint` and `test`: that make interface is the whole
contract on the caller's side, whatever its toolchain.

`lint.yaml` is the one workflow that is this repository's own: it runs `make lint`,
which judges the shape of `docs/`.

Nothing here is deployed. Editing a workflow changes every repository's next
run, on `@main`, with no version to bump and no release to cut: callers pin the
branch, not a tag.

## Where to read

| Question                                                    | Chapter                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| What does each workflow do, and what does it take?          | [docs/concepts/architecture.md](docs/concepts/architecture.md)          |
| I am changing a workflow or an action                       | [docs/guides/develop.md](docs/guides/develop.md)              |
| How do I prove a change before a consumer feels it?          | [docs/guides/test.md](docs/guides/test.md)                    |
| I am setting a repository up to use these                    | [docs/guides/wire-a-repository.md](docs/guides/wire-a-repository.md)        |
| Which secrets, and where do they come from?                  | [docs/reference/secrets.md](docs/reference/secrets.md)                    |

The chart a Docker release deploys through, and the manifest an app owns, are
`studio-infrastructure`'s documentation, not this repository's.
