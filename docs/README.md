# The corpus

Shared CI and CD for the `@jterrazz` ecosystem: what the reusable workflows
do, how a change to them is made and proven, and what a repository has to
carry to call them.

| Chapter                                            | Holds                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [01-architecture.md](01-architecture.md)           | The five reusable workflows and the four composite actions they are built from            |
| [02-developing.md](02-developing.md)               | Which file a change opens, what has to stay in step with it, and why no actionlint runs   |
| [03-testing.md](03-testing.md)                     | How a change is proven before a consumer feels it — honestly, since nothing runs here on push |
| [05-wiring-a-repo.md](05-wiring-a-repo.md)         | The two workflow files and the Makefile a consuming repository carries                    |
| [06-secrets.md](06-secrets.md)                     | Infisical, the two GitHub secrets, and the Tauri signing set                              |

This repository ships nothing of its own, so it carries no `04-operating.md`
— [01-architecture.md](01-architecture.md) names the cluster these workflows
deploy TO and the schema an app repository owns.
