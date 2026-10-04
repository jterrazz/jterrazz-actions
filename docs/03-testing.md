# Testing

Nothing mechanical proves a change here today: this repository has no
package.json, no Makefile, and every one of its five workflows triggers only
on `workflow_call` — none of them runs on a push or a pull request to this
repository's own `main`. Read that honestly rather than as a gap to explain
away.

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
  [05-wiring-a-repo.md](05-wiring-a-repo.md) names the two files a caller
  carries. The pin is temporary: it moves back to `@main` once the run is
  green, since callers otherwise pin the branch, not a tag.
- **A human reading the diff** against the invariants two chapters name:
  [01-architecture.md](01-architecture.md) for what each workflow and action
  is meant to do, [02-developing.md](02-developing.md) for what a change owes
  in step.

## The cost of being wrong

Every caller references `@main`. A broken workflow lands on every
repository's very next run — there is no version to pin back to and no
release to hold — so the branch-pinned run above is the only rehearsal a
change gets before every `@jterrazz` repository feels it at once.
