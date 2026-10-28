#!/usr/bin/env bash
# invariant: the dependencies are installed by the repository's own rule when its Makefile has
# one, so the later `make build` finds its install stamp fresh and never installs twice; a
# repository without such a rule is installed from its lockfile. npm's audit and funding notes
# are silenced by the job's environment: the image scan and Renovate's security lane own that.
set -euo pipefail
if grep -qE '^node_modules/\.install:' Makefile 2>/dev/null; then
  make node_modules/.install
elif grep -qE '^node_modules:' Makefile 2>/dev/null; then
  make node_modules
elif [ -f bun.lock ]; then
  bun install --frozen-lockfile
elif [ -f pnpm-lock.yaml ]; then
  corepack pnpm install --frozen-lockfile
elif [ -f package-lock.json ]; then
  npm ci
fi
