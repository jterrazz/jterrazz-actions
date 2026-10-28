# The corpus

Shared CI and CD for the `@jterrazz` ecosystem: what the reusable workflows
and actions do, how they are named, how a change to them is made and proven,
and what a repository carries to call them.

## Guides

| Page                                                | Holds                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [wire-a-repository.md](guides/wire-a-repository.md) | The files a consuming repository carries, per family, and the Makefile they call      |
| [develop.md](guides/develop.md)                     | Which file a change opens, the rules the layout holds to, and what moves in step      |
| [test.md](guides/test.md)                           | What Self-test proves at a change's own commit, and what only a real Deploy proves    |

## Concepts

| Page                                              | Holds                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [architecture.md](concepts/architecture.md)       | The four families, the Check, the Deploy run and its summary, the Publish, the actions |
| [artifacts-cache.md](concepts/artifacts-cache.md) | Why CI keeps one cache root, and how its key tracks HEAD                                |

## Reference

| Page                              | Holds                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| [naming.md](reference/naming.md)  | The naming rule of each level, from the workflow file to the step             |
| [secrets.md](reference/secrets.md) | Why a caller stores no secret: each service takes the job's GitHub OIDC token |

This repository ships nothing of its own, so it carries no `guides/release.md`
and no `start/` tutorial: [architecture.md](concepts/architecture.md) names
the cluster a Deploy deploys to and the manifest an app repository owns.
