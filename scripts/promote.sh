#!/usr/bin/env bash
# invariant: moves an alias (`latest`, or a `v*` tag) onto a digest already in the registry, by
# putting back the exact bytes of its manifest under the alias, so the alias and the immutable
# `sha-*` tag name one digest. Usage: promote.sh <image-name> <digest> <alias>
set -euo pipefail
image="$1" digest="$2" alias="$3"
# shellcheck source=registry.sh
. "$(dirname "$0")/registry.sh"
body=$(mktemp)
type=$(curl -fsS --netrc-file "$REGISTRY_NETRC" -H "Accept: $ACCEPT" -o "$body" -w '%{content_type}' \
  "https://$REGISTRY/v2/$image/manifests/$digest")
curl -fsS --netrc-file "$REGISTRY_NETRC" -X PUT -H "Content-Type: $type" --data-binary "@$body" \
  "https://$REGISTRY/v2/$image/manifests/$alias" -o /dev/null
echo "$image:$alias → $digest"
