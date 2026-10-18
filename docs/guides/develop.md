# Developing

There is no package to install and no build to run here: a change is a hand
edit to a workflow's or an action's YAML, and this guide says which file
that edit opens and what else it has to stay in step with.

## Which file a change opens

| Changing                                                     | Open                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| The three gates every caller runs, or the `.artifacts` cache   | `.github/workflows/validate.yaml`                                       |
| A Docker release end to end                                    | `.github/workflows/release-docker.yaml` and the four `actions/*/action.yaml` |
| `npm publish` behaviour                                        | `.github/workflows/release-npm.yaml`                                    |
| The Go cross-compile matrix                                    | `.github/workflows/release-go.yaml`                                     |
| Tauri build, signing and notarization                          | `.github/workflows/release-tauri.yaml`                                  |
| What a page tells a reader                                  | `docs/*`, then the routing tables in `AGENTS.md` and `skills/jterrazz-workflows/SKILL.md` that mirror it |

## What a change owes

Two places carry a fact twice because nothing here compiles one into the
other, and a change to the source is not a change to its copy on its own:

- **`release-go.yaml` spells the three gates and the `.artifacts` cache out in
  its own job instead of calling `validate.yaml`**, so that Go's own toolchain
  can join the same cache; see the `release-go.yaml` section of
  [architecture](../concepts/architecture.md). The two are meant to stay
  identical; a change to one is a change to both.
- **`AGENTS.md`'s routing table, `skills/jterrazz-workflows/SKILL.md`'s routing
  table and `docs/README.md`'s map name the same pages.** A page
  renamed in one is renamed in the other two, by hand: there is no
  compiler here to catch the two that were forgotten.

## No actionlint runs here

Beyond `make lint` ([test.md](test.md)), which judges `docs/` only, nothing
under `.github/` or `actions/` invokes `actionlint`, or any other schema checker, against this repository's own YAML; a change is reviewed by
eye, against the four rules a consuming repository is held to
([wire-a-repository.md](wire-a-repository.md)), and against the invariants this
guide names. What actually catches a malformed workflow, and when, is
[test.md](test.md).

## The comment a step earns

A step whose behaviour is not obvious from its name carries a comment beside
it explaining the constraint that shaped it, not what the step does. The
existing steps are the model to match, e.g. why Buildx runs with
`network=host` (`actions/docker-build/action.yaml`), why the `.artifacts`
cache key carries the run id (`.github/workflows/validate.yaml`), and why the
registry credentials ride a netrc file rather than a `curl -u` argument
(`actions/docker-cleanup/action.yaml`). A step that merely calls a well-known
action needs none.
