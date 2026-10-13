# The corpus

Shared CI and CD for the `@jterrazz` ecosystem: what the reusable workflows
do, how a change to them is made and proven, and what a repository has to
carry to call them.

## Guides

| Page                                                  | Holds                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [wire-a-repository.md](guides/wire-a-repository.md)   | The two workflow files and the Makefile a consuming repository carries                         |
| [develop.md](guides/develop.md)                       | Which file a change opens, what has to stay in step with it, and why no actionlint runs        |
| [test.md](guides/test.md)                             | How a change is proven before a consumer feels it, honestly, since nothing runs here on push   |

## Concepts

| Page                                                  | Holds                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [architecture.md](concepts/architecture.md)           | The five reusable workflows and the four composite actions they are built from                 |
| [artifacts-cache.md](concepts/artifacts-cache.md)     | Why CI keeps one cache root, and how its key tracks HEAD                                       |

## Reference

| Page                                                  | Holds                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [secrets.md](reference/secrets.md)                    | Infisical, the two GitHub secrets, and the Tauri signing set                                   |

This repository ships nothing of its own, so it carries no `guides/release.md`
and no `start/` tutorial: [architecture.md](concepts/architecture.md) names
the cluster these workflows deploy TO and the schema an app repository owns.
