#!/usr/bin/env bash
# invariant: the Makefile's `mutation` target, over the lines this push or pull request changed,
# and only where it means something: the caller leaves it on, the Makefile has the target, and
# the change touches more than Markdown and the manual under docs/. Each other case is recorded
# as an "off" gate, with why, so the checks table never shows a pass that did not run.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [ "$MUTATION" != "true" ]; then
  exec "$here/gate.sh" --off Mutation "off on this run"
fi
if ! grep -q '^mutation:' Makefile 2>/dev/null; then
  exec "$here/gate.sh" --off Mutation "no mutation target"
fi
since=$("$here/mutation-since.sh")
if [ -n "$since" ]; then
  changed=$(git diff --relative --name-only "$since" HEAD -- .)
  if ! grep -qvE '\.md$|^docs/' <<< "$changed"; then
    exec "$here/gate.sh" --off Mutation "only Markdown and docs/ changed"
  fi
fi
TYPESCRIPT_MUTATION_SINCE="$since" exec "$here/gate.sh" Mutation make mutation
