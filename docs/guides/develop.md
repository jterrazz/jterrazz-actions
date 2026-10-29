# Developing

A change here is an edit to a workflow, an action or a script, and it
reaches every caller on its next run: callers pin `@main`, with no version to
bump and no release to cut. This guide says which file a change opens, the
rules the layout holds to, and what has to move in step.

## Which file a change opens

| Changing                                         | Open                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| What a check runs, installs or records           | `actions/check/action.yaml`, `scripts/{gate,install,mutation,hadolint}.sh` |
| What a Deploy builds, and where it deploys       | `scripts/plan.mjs`                                                      |
| The order and the jobs of a Deploy               | `.github/workflows/deploy-docker.yaml`                                  |
| One step of a Deploy                             | its action: `build-image`, `scan-image`, `deploy-app`, `verify-app`, `prune-images` |
| The summary a Deploy ends on                     | `scripts/summary.mjs`                                                   |
| `npm publish`, or the Go cross-compile           | `.github/workflows/publish-npm.yaml`, `publish-go.yaml`                 |
| How CI reaches the infrastructure                | `actions/connect-infra`, `actions/connect-cluster`                      |
| What a page tells a reader                       | `docs/`, then the routing tables of `CLAUDE.md` and `skills/studio-workflows/SKILL.md` |

## The rules the layout holds to

- **No reusable workflow calls another.** A nested call names its jobs by its
  call path ("build-and-deploy / Validate / Validate") and pins the inner
  workflow at `@main` whatever ref the outer one runs at. What every family
  shares is a composite action.
- **An action calls no other action of this repository.** A nested
  `uses: jterrazz/studio-actions/actions/…@main` runs `main`'s copy even when
  the outer action is under test at a branch. A job calls the actions it needs
  one after the other instead.
- **An action's logic is a script.** Every non-trivial step is a file in
  `scripts/`, reached as `$GITHUB_ACTION_PATH/../../scripts/…`: the runner
  downloads this whole repository for an action, at the action's ref, so the
  script is the one of the same commit. A script is what the unit tests run.
- **An option is an input, never a skipped step.** A shared workflow's job
  lists only steps that run; the action decides inside.
- **A pinned tool is a binary with a checksum** (Trivy, hadolint, actionlint),
  and an action from the marketplace is pinned by commit, which Renovate
  moves.
- **A job hands its facts on as a report artifact**, a JSON file the Summary
  reads; job outputs carry only what a later job's `if:` or matrix needs.

## What moves in step

- `CLAUDE.md`'s routing table, `skills/studio-workflows/SKILL.md`'s and
  `docs/README.md`'s map name the same pages; a page renamed in one is
  renamed in the other two.
- The summary's format is pinned by `tests/summary.test.mjs`; a change to the
  renderer changes those assertions on purpose.

## The comment a step earns

A step whose behaviour is not obvious from its name carries a comment stating
the constraint that shaped it, opened by its kind (`invariant:`, `hazard:`,
`outside:`, `value:`), which `make lint` enforces. The models are why Buildx
runs with `network=host` (`actions/build-image`), why a registry credential
rides a netrc file (`scripts/registry.sh`), and why Trivy is a pinned binary
(`actions/scan-image`). A step that calls a well-known action needs none.
