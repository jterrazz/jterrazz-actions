# The corpus

Shared CI and CD for the `@jterrazz` ecosystem: what the reusable workflows
do, what a repository has to carry to call them, and which secrets they need.

| Chapter                                            | Holds                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| [01-workflows.md](01-workflows.md)                 | The five reusable workflows, their inputs, and how a deploy resolves its environments |
| [02-composite-actions.md](02-composite-actions.md) | The four composite actions the release workflows are built from    |
| [03-wiring-a-repo.md](03-wiring-a-repo.md)         | The two workflow files and the Makefile a consuming repository carries |
| [04-secrets.md](04-secrets.md)                     | Infisical, the two GitHub secrets, and the Tauri signing set       |

The cluster these workflows deploy to is
[jterrazz/jterrazz-infrastructure](https://github.com/jterrazz/jterrazz-infrastructure);
what an app repository owes it, and the `application.yaml` schema, are its
documentation.
