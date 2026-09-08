# Operating

This repository ships nothing of its own that runs: no Dockerfile, no
`.infrastructure/`, no publishable root package. What follows is the whole of
its operating story, and it is short.

## There is no release

A change lands the moment it merges to `main`. Every consuming repository
calls a workflow by branch — `@main`, not a version tag — so there is no
artefact to build, no package to publish and no release to cut for this
repository itself: editing a workflow changes every repository's very next
run. Merging a change here redeploys nothing on its own; what runs afterwards
is each CALLER's own pipeline, described from this repository's side in
[01-architecture.md](01-architecture.md).

## What this repository causes to run

The workflows and actions themselves cause other repositories to build
images, publish packages, cross-compile binaries and deploy to the cluster —
[jterrazz/jterrazz-infrastructure](https://github.com/jterrazz/jterrazz-infrastructure)
owns that cluster and the chart a Docker release deploys through. None of it
is this repository's own footprint.
