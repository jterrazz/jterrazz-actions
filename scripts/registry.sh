#!/usr/bin/env bash
# invariant: the registry's HTTP API, authenticated through a netrc file, never `-u user:password`:
# an argument is readable in `ps` by anything else on the runner for as long as curl runs. The
# values come from the environment connect-infra exported, so they are not interpolated into any
# script text either; the only copy is the 0600 file, removed when the sourcing script exits.
# Sourced: it defines REGISTRY_NETRC and the ACCEPT header every manifest request sends.
REGISTRY_NETRC=$(mktemp)
trap 'rm -f "$REGISTRY_NETRC"' EXIT
chmod 600 "$REGISTRY_NETRC"
printf 'machine %s\nlogin %s\npassword %s\n' "$REGISTRY" "$DOCKER_REGISTRY_USERNAME" "$DOCKER_REGISTRY_PASSWORD" > "$REGISTRY_NETRC"
# hazard: index and manifest-list types first, so a tag answers with the digest of its top-level
# manifest; asking for one platform's type alone negotiates down to a child, and acting on the
# child's digest orphans every other tag that shares the index.
export ACCEPT='application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json'
