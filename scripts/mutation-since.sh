#!/usr/bin/env bash
# invariant: prints the commit a push or a pull request started from (BASE, else BEFORE). The
# toolchain refuses a commit the clone lacks, so a force-push or a branch's first push (the zero
# commit) measures from the fork point with the default branch, or the parent commit, named on
# stderr. A schedule or a dispatch carries no commit, so it prints nothing and the working tree
# is measured against HEAD.
set -uo pipefail
since="${BASE:-${BEFORE:-}}"
if [ -n "$since" ] && ! git cat-file -e "$since^{commit}" 2>/dev/null; then
  fallback=$(git merge-base HEAD "origin/${DEFAULT_BRANCH:-main}" 2>/dev/null || true)
  if [ -z "$fallback" ] || [ "$fallback" = "$(git rev-parse HEAD)" ]; then
    fallback=$(git rev-parse --verify --quiet HEAD~1 || true)
  fi
  echo "The clone holds no commit $since: the change is measured since ${fallback:-HEAD}." >&2
  since="$fallback"
fi
echo "$since"
