#!/usr/bin/env bash
# invariant: keeps `latest`, the newest KEEP_VERSIONS `v*` tags and the newest KEEP_BUILDS `sha-*`
# builds (by the image's creation date, since a tag list has no order), and deletes every other
# tag's manifest, unless a kept tag shares its digest: deleting a digest deletes every tag on it.
# A recent `sha-*` build is kept because another run may be about to deploy it, and a node
# reschedules a pod by the digest it was deployed with. The blobs are swept by the
# infrastructure's weekly `registry-gc` job, never here. Usage: prune.sh <image-name>
set -euo pipefail
image="$1"
keep_versions="${KEEP_VERSIONS:-3}"
keep_builds="${KEEP_BUILDS:-5}"
# shellcheck source=registry.sh
. "$(dirname "$0")/registry.sh"
tags=$(curl -fsS --netrc-file "$REGISTRY_NETRC" "https://$REGISTRY/v2/$image/tags/list" | jq -r '.tags[]? // empty') || true
if [ -z "$tags" ]; then
  echo "No tags to prune"
  exit 0
fi
digest_of() {
  curl -fsS -I --netrc-file "$REGISTRY_NETRC" -H "Accept: $ACCEPT" "https://$REGISTRY/v2/$image/manifests/$1" \
    | grep -i '^docker-content-digest:' | awk '{print $2}' | tr -d '\r'
}
created_of() {
  docker buildx imagetools inspect "$REGISTRY/$image:$1" --format '{{json .Image}}' 2>/dev/null \
    | jq -r 'if has("created") then .created else ([.[] | .created? // empty] | max) end // ""' || true
}
keep=$(grep -x latest <<< "$tags" || true)
keep+=$'\n'$(grep -E '^v[0-9]' <<< "$tags" | sort -V | tail -n "$keep_versions" || true)
builds=$(grep -E '^sha-' <<< "$tags" || true)
if [ -n "$builds" ]; then
  keep+=$'\n'$(while read -r tag; do echo "$(created_of "$tag") $tag"; done <<< "$builds" | sort -r | head -n "$keep_builds" | awk '{print $2}')
fi
declare -A kept_digests
while read -r tag; do
  [ -z "$tag" ] && continue
  d=$(digest_of "$tag" || true)
  [ -n "$d" ] && kept_digests[$d]=1
done <<< "$keep"
deleted=0
while read -r tag; do
  grep -qx "$tag" <<< "$keep" && continue
  d=$(digest_of "$tag" || true)
  [ -z "$d" ] && continue
  if [ -n "${kept_digests[$d]:-}" ]; then continue; fi
  curl -fsS -X DELETE --netrc-file "$REGISTRY_NETRC" "https://$REGISTRY/v2/$image/manifests/$d" -o /dev/null || true
  echo "Deleted $tag ($d)"
  deleted=$((deleted + 1))
done <<< "$tags"
echo "Pruned $deleted tags; kept $(grep . <<< "$keep" | paste -sd ' ' -)"
