# Testing

Almost nothing mechanical proves a change here: every one of the five
workflows triggers only on `workflow_call`, so none of them runs on a push or a
pull request to this repository's own `main`. The one gate that does run is
`make lint`, which judges the shape of `docs/` and nothing else. Read that
honestly rather than as a gap to explain away.

## What `make lint` proves

`make lint` runs `typescript docs-layout .` from `@jterrazz/typescript`: the
manual is cut into `start/`, `guides/`, `concepts/`, `reference/` and
`decisions/`, the map links only its own pages, and the required pages exist.
It needs no `package.json` — `npx` fetches the toolchain — and
`.github/workflows/lint.yaml` runs it on every push and pull request. It does
not read the YAML under `.github/` or `actions/`, nor the prose, the names or
the secrets of this repository: the toolchain's other passes are bound to an
npm project, and this one is not.

## What actually catches a mistake

- **GitHub's own parser**, the moment a caller invokes the workflow — a
  malformed `on:`, a typo'd input name or an `${{ }}` that does not resolve
  fails that caller's job immediately, with GitHub's own message. That is the
  earliest mechanical feedback there is, and it fires in the CALLER's run, not
  this repository's.
- **A real consumer's run, pointed at the branch.** Because a caller names a
  ref in its `uses:` line (`@main`, a tag, a SHA), pointing one caller's
  `uses:` at this change's branch instead of `@main` and pushing is the one
  way to see the workflow execute before it reaches every other repository —
  [wire-a-repository.md](wire-a-repository.md) names the two files a caller
  carries. The pin is temporary: it moves back to `@main` once the run is
  green, since callers otherwise pin the branch, not a tag.
- **A human reading the diff** against the invariants two pages name:
  [architecture](../concepts/architecture.md) for what each workflow and action
  is meant to do, [develop.md](develop.md) for what a change owes
  in step.

## The cost of being wrong

Every caller references `@main`. A broken workflow lands on every
repository's very next run — there is no version to pin back to and no
release to hold — so the branch-pinned run above is the only rehearsal a
change gets before every `@jterrazz` repository feels it at once.
