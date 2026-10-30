# Naming

One rule per level, the same in every repository, so a run reads the same
wherever it comes from.

| Level            | Rule                                                              | Examples                                         |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Workflow file    | kebab-case, `.yaml` only, the workflow's name                     | `check.yaml`, `deploy.yaml`                      |
| Workflow         | one capitalised word: the intent                                  | Check, Deploy, Publish, Watch                    |
| Run title        | `run-name`: subject, target, trigger                              | Deploy main · weekly rebuild                      |
| Job              | a short name, its target after `·`, never the technical id        | Plan, Check, Build · sha-a0636b8, Deploy · prod  |
| Job id           | short, the displayed name in lowercase                            | `deploy` shows as Deploy / Plan                  |
| Step             | imperative verb and object, sentence case, four words at most     | Check out, Build image, Roll out                 |
| Composite action | verb-object, kebab-case                                           | `scan-image`, `connect-infra`                    |
| Shared workflow  | the family, then what it serves when there are several            | `deploy-docker.yaml`, `publish-npm.yaml`         |
| Emoji            | in a summary only, for a state (✅ ⚠️ ❌), never in a name         |                                                  |

A caller's job id is the prefix GitHub writes before every job of the shared
workflow it calls, which is why it is one short word: `deploy` gives
"Deploy / Build · sha-a0636b8", where a nested call once gave
"deploy / Check / Check".

Names, steps and summaries are in English, like the code and GitHub's own
interface.

## Two exceptions

- **An npm package's Publish file keeps its old name** (`release.yaml`, or
  `release.yml` in hoverfly-lsp): npm's trusted publishing names the
  workflow file it trusts, and only the package's owner can move it on
  npmjs.com. The workflow inside is named Publish; the file is renamed once
  the trusted publisher names `publish.yaml`.
- **This repository's own workflow is Self-test**, since `check.yaml` here is
  the shared workflow every caller's Check calls.
