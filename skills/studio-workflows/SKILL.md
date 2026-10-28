---
name: studio-workflows
description: "Shared CI/CD workflows for jterrazz projects: the Check, Deploy, Publish and Watch families (check.yaml, deploy-docker.yaml, publish-npm.yaml, publish-go.yaml). Use when setting up GitHub Actions, configuring CI, deploying or publishing, reading a run's summary, or debugging a workflow failure in a jterrazz repo."
---

# studio-workflows

Part of the `@jterrazz` ecosystem: the reusable GitHub Actions workflows every
project checks, deploys and publishes through. A repository carries one small
file per family (`check.yaml`, `deploy.yaml`, `publish.yaml`, `watch.yaml`)
and a `Makefile` exposing `build`, `lint` and `test`, and inherits the
pipeline.

Callers reference `@main`, so a change here lands on every repository's next
run. The shared workflows are `check`, `deploy-docker`, `publish-npm` and
`publish-go`; the composite actions are `check`, `plan-deploy`,
`connect-infra`, `connect-cluster`, `build-image`, `scan-image`,
`deploy-app`, `verify-app`, `prune-images`, `write-summary`,
`cache-artifacts` and `resolve-mutation-range`.

## Where to read

The map of the corpus is `docs/README.md`, in the `studio-actions`
repository.

| Need                                                                  | Read                               |
| --------------------------------------------------------------------- | ---------------------------------- |
| What a workflow or an action does, a Deploy run, its summary          | `docs/concepts/architecture.md`    |
| What a file, a job or a step is named                                 | `docs/reference/naming.md`         |
| Changing a workflow, an action or a script                            | `docs/guides/develop.md`           |
| Proving a change before a consumer feels it                           | `docs/guides/test.md`              |
| Setting a repository up: the files per family                         | `docs/guides/wire-a-repository.md` |
| Why a caller stores no secret (GitHub OIDC)                           | `docs/reference/secrets.md`        |
| The `application.yaml` schema a Docker app owns                       | [the deploy contract](https://github.com/jterrazz/studio-infrastructure/blob/main/docs/reference/deploy-contract.md), in `studio-infrastructure` |

## Always

- Node.js 24, unless a caller says otherwise.
- An npm package's Publish file keeps the name its npm trusted publisher
  names (`release.yaml` until the owner moves it to `publish.yaml`).
- No stored secret: a deploying or publishing job grants `id-token: write`.
- Every Deploy and Publish checks first; a Deploy reads its summary for the
  verdict, the job logs for the detail.
