# The `.artifacts` cache

Why CI keeps one cache root, and how its key is built.

The three gates run against a restored `.artifacts/`, the single root every
`@jterrazz` repository writes build and tool state under: `.artifacts/tsc/`
for the incremental buildinfo, then `vitest/`, `knip/`, `next/`, `cargo/`,
`playwright/`. One entry warms every toolchain in the repo at once, so a
compile survives between runs instead of starting cold on every push.
[`actions/check`](../../actions/check) restores it before the gates and saves
it after them, wherever a check runs; a repository whose check is its own
calls [`actions/cache-artifacts`](../../actions/cache-artifacts) for the same
cache.

A consumer does nothing to benefit but point its tools there, as
[wire-a-repository.md](../guides/wire-a-repository.md). A repository that writes nothing
under `.artifacts/` is unaffected: the restore misses, the save finds no path
and logs a warning, and neither fails the job.

Two things are deliberately not cached. `dist/` stays out, because a release
must ship what the commit says and not what a cache remembers. So does
`node_modules/`, which is the package manager's concern and is already
handled by `setup-node`'s `cache: npm`.

A Docker image's layers are a cache of their own, which Build keeps in
GitHub's cache under the image's name
([`actions/build-image`](../../actions/build-image)); both draw on the
repository's 10 GB.

Every run saves under `artifacts-<os>-<arch>-<lockfile hash>-<ref name>-<run id>`,
the hash covering the lockfile of every toolchain the estate uses
(`package-lock.json`, `bun.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`).
A cache key is immutable once written, and a buildinfo changes with every
commit, so one entry per run is what keeps the cache tracking HEAD rather
than freezing at a branch's first green.

Restoring is therefore all prefix match, in two widening steps: the same
branch's most recent run, then the same lockfile on any branch. That is how
a fresh branch, and a `v*` tag, start from the tree `main` last left.

It never widens past the lockfile. Tool state built against other
dependencies is not inert: Vite's optimised dependencies, restored across a
lockfile change, re-optimise in the middle of a browser run and fail tests
that import them. A changed lockfile therefore starts cold, once, and its
run seeds the entries every later run restores.

Restore and save are separate steps so the save can run on `always()`: a red
run still compiled, and its retry is what most wants a warm tree. It needs no
cache-hit guard, since a key carrying the run id is new by construction. A
run that failed before its restore hands the save no key: the save notes
that nothing was restored and saves nothing, rather than adding a second
error under the first.

The cost is one entry per run against the repository's 10 GB budget, which
GitHub evicts LRU, so the oldest runs fall off on their own, and what
survives is the recent history that a restore would actually pick. Entries
are small: tool state only, no `dist/`, no `node_modules/`.
