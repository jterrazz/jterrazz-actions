---
name: jterrazz-workflows
description: "Shared CI/CD workflows for jterrazz projects: validate, release-npm, release-docker, release-go. Use when setting up GitHub Actions, configuring CI, releasing, or debugging workflow failures in a jterrazz repo."
---

# jterrazz-workflows

Part of the `@jterrazz` ecosystem: the reusable GitHub Actions workflows every
project validates and releases through. A repository carries two workflow files
and a `Makefile` exposing `build`, `lint` and `test`, and inherits the pipeline.

Callers reference `@main`, so a change here lands on every repository's next
run. The workflows are `validate`, `release-npm`, `release-docker` and
`release-go`; the composite actions they are built from are
`mutation-since`, `artifacts-cache`, `infra-connect`, `docker-build`,
`docker-deploy` and `docker-cleanup`.

## Where to read

The map of the corpus is `docs/README.md`, in the `jterrazz-actions`
repository.

| Need                                             | Read                            |
| -------------------------------------------------- | --------------------------------- |
| What a workflow does, its inputs, its triggers, what happens inside a Docker release | `docs/concepts/architecture.md` |
| Changing a workflow or an action                  | `docs/guides/develop.md`          |
| Proving a change before a consumer feels it        | `docs/guides/test.md`             |
| Setting a repository up: the two workflow files    | `docs/guides/wire-a-repository.md` |
| Infisical and the GitHub secrets                   | `docs/reference/secrets.md`      |
| The `application.yaml` schema a Docker app owns    | `jterrazz-infrastructure`, `kubernetes/charts/app/README.md` |

## Always

- Node.js 24, unless a workflow's own default says otherwise.
- The release caller is named `release.yaml`, since npm provenance is configured
  against that filename.
- Never skip validation: every release workflow runs it first.
