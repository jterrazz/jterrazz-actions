# Testing

A change is proven here, at its own commit, before `@main` hands it to every
repository. `.github/workflows/self-test.yaml` (Self-test) runs on every
push and pull request, and calls each action by its `./` path, so what runs
is the change itself, not `main`'s copy.

## What Self-test proves

| Job                              | Proves                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Docs                             | `make lint`: the manual's layout, prose and links, every comment's kind, the names and the secrets             |
| Scripts                          | actionlint over the workflows, shellcheck over `scripts/`, the unit tests, and `plan-deploy` on a fixture manifest |
| Check · passing fixture          | `actions/check` on `tests/fixtures/projects/passing`: every pass recorded green, hadolint's warning as a note, mutation run |
| Check · failing fixture          | the same action on a project whose lint fails: the report names Lint failed, with the passes the toolchain's verdict line lists, and the passes after it not run |
| Expect the failing fixture to fail | the failing fixture's Check step really failed, read from its outcome, while its job stays green            |
| Scan · known-vulnerable image    | `scan-image` on an image holding lodash 4.17.11 (a critical with a fix): reporting warns and passes, enforcing fails |

The unit tests (`node --test tests/*.test.mjs`, no dependency to install)
cover the two scripts whose output is a decision:

- **The plan**, over the manifests in `tests/fixtures/manifests/`: a push, a
  `v*` tag, the daily schedule (both builds, and one when `main` is the newest
  tag), a tag with no release environment, a dispatch on a branch, a shared
  app, and an environment naming neither `deploy` value.
- **The summary**, over the reports in `tests/fixtures/reports/`: a deployed
  run (title, commit line, environments, checks, image, release hint), a run
  blocked at each stage (Plan with no report at all, Check naming what failed
  inside the pass, Build, Scan, Deploy, Verify naming the probe), a cancelled
  run, a superseded Verify, plus the checks report the action writes.

Run them on a laptop with `make test`; `make lint` needs
Node alone.

## What Self-test cannot prove

A shared workflow reaches its actions at `@main`, and a Deploy needs the
tailnet, the registry and the cluster, which only a caller's identity is
trusted with. So the jobs of `deploy-docker.yaml` are proven by their parts
here, and as a whole by a real run:

1. Land the action change with its Self-test green.
2. Run one app's Deploy by hand, `gh workflow run deploy.yaml -R jterrazz/<app>`,
   and read its summary; the job log holds the same Markdown under
   "Summary (Markdown)".
3. Then let the other apps' next pushes or the daily rebuild take it.

A change to a shared workflow's own YAML (its jobs, needs, matrix or
concurrency) is checked by actionlint here and executed only in a caller.
Pointing one caller's `uses:` at a branch instead of `@main` runs the
workflow before `main` has it, with its actions still at `@main`.

## The cost of being wrong

Every caller references `@main`. A broken shared workflow lands on every
repository's next run at once, with no version to pin back to: revert the
commit, and the next run of each caller is healed.
