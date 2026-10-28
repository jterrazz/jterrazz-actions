#!/usr/bin/env bash
# invariant: hadolint over the Dockerfile, warnings only for now: every finding becomes an
# annotation on its line and the count becomes the gate's note, and nothing fails until the
# images are rebuilt to the standard (studio-actions' pipeline vision, phase 4).
# hazard: the binary, pinned by version and checksum, as Trivy is: nothing can move under it.
set -euo pipefail
dockerfile="$1"
version="2.15.1"
sha256="f6198ef8090f404dbb771abfee086eb8c48ac177f30da7fd3510aca35b344b5d"
bin="$RUNNER_TEMP/hadolint-$version"
if [ ! -x "$bin" ]; then
  curl -fsSL -o "$bin" "https://github.com/hadolint/hadolint/releases/download/v${version}/hadolint-linux-arm64"
  echo "${sha256}  $bin" | sha256sum --check --quiet
  chmod +x "$bin"
fi
findings=$("$bin" --no-fail --format json "$dockerfile" || echo '[]')
# outside: an annotation names its file from the repository's root, not the working directory.
path=$(realpath --relative-to="${GITHUB_WORKSPACE:-.}" "$dockerfile")
jq -r --arg path "$path" \
  '.[] | "::warning file=\($path),line=\(.line),title=hadolint \(.code)::\(.message)"' <<< "$findings"
count=$(jq 'length' <<< "$findings")
if [ "$count" -eq 0 ]; then
  echo "hadolint: $dockerfile follows every rule"
else
  note="$count warnings"
  if [ "$count" -eq 1 ]; then note="1 warning"; fi
  echo "$note" > "$GATE_NOTE_FILE"
  echo "hadolint: $note in $path, reported and not enforced"
fi
