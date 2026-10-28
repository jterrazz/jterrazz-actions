#!/usr/bin/env bash
# invariant: a deployment is verified when every Deployment in its namespace is rolled out and
# every route answers as its `studio.jterrazz.com/smoke-*` annotations say (path, expected codes,
# Location, method; `smoke-probe: "false"` opts a route out; a route that states nothing is asked
# GET / and expects 200), the contract studio-infrastructure's platform suite reads too. A
# namespace whose Deployment no longer runs DIGEST was deployed again since: it is reported as
# superseded and verified no further. Writes REPORT; exits 1 on a failed rollout or probe.
# shellcheck disable=SC2016
set -uo pipefail
ns="$NAMESPACE"
jq -n --arg env "$ENVIRONMENT" --arg ns "$ns" '{env: $env, namespace: $ns, ready: null, probes: [], outcome: "failure", superseded: false, promoted: null}' > "$REPORT"
update() { jq "$@" "$REPORT" > "$REPORT.tmp" && mv "$REPORT.tmp" "$REPORT"; }

rolled=0
for deployment in $(kubectl get deployments -n "$ns" -o name); do
  kubectl rollout status "$deployment" -n "$ns" --timeout="${ROLLOUT_TIMEOUT:-120s}" || rolled=1
done
ready=$(kubectl get deployments -n "$ns" -o json | jq -r '"\([.items[].status.readyReplicas // 0] | add // 0)/\([.items[].spec.replicas // 0] | add // 0)"')
update --arg ready "$ready" '.ready = $ready'
echo "ready $ready"
if [ "$rolled" -ne 0 ]; then
  echo "::error::$ns did not roll out: ready $ready"
  exit 1
fi

if ! kubectl get deployments -n "$ns" -o json | jq -e --arg digest "$DIGEST" '[.items[].spec.template.spec.containers[].image | endswith($digest)] | any' >/dev/null; then
  echo "::warning::$ns no longer runs $DIGEST: a newer deploy superseded this one, which neither probes nor moves an alias"
  update '.superseded = true | .outcome = "success"'
  exit 0
fi

# outside: a private host's public CNAME points into the tailnet's *.ts.net zone, which only
# tailscaled answers and the runner's resolver often never chases; it is resolved here, as
# connect-infra resolves the registry.
resolve_args() {
  local target ip
  target=$(dig +short CNAME "$1" @1.1.1.1 | tail -1 | sed 's/\.$//')
  if [[ "$target" == *.ts.net ]]; then
    ip=$(tailscale ip -4 "$target" 2>/dev/null | head -1)
    [ -n "$ip" ] && echo "--resolve $1:443:$ip"
  fi
}

failed=0
routes=$(kubectl get ingressroutes.traefik.io -n "$ns" -o json | jq -c '
  .items[] | (.metadata.annotations // {}) as $a
  | select(($a["studio.jterrazz.com/smoke-probe"] // "") | ascii_downcase != "false")
  | [.spec.routes[]?.match // "" | scan("Host\\(`([^`]+)`\\)")[0]] | unique[] as $host
  | {host: $host,
     path: (($a["studio.jterrazz.com/smoke-path"] // "/") | if startswith("/") then . else "/" + . end),
     expect: (($a["studio.jterrazz.com/smoke-expect"] // "200") | split(",") | map(tonumber)),
     location: ($a["studio.jterrazz.com/smoke-location"] // ""),
     method: ($a["studio.jterrazz.com/smoke-method"] // "GET")}')
while read -r route; do
  [ -z "$route" ] && continue
  host=$(jq -r .host <<< "$route") path=$(jq -r .path <<< "$route") method=$(jq -r .method <<< "$route")
  location=$(jq -r .location <<< "$route")
  url="https://$host$path"
  read -r -a resolve <<< "$(resolve_args "$host")"
  ok=false status=0 redirect=""
  # value: six tries over about a minute: a route's certificate or its endpoints can trail the
  # rollout by seconds.
  for _ in 1 2 3 4 5 6; do
    answer=$(curl -s -o /dev/null -X "$method" --max-time 10 "${resolve[@]}" -w '%{http_code} %{redirect_url}' "$url")
    status=$((10#${answer%% *})) redirect=${answer#* }
    if jq -e --argjson s "$status" '.expect | index($s) != null' <<< "$route" >/dev/null \
      && { [ -z "$location" ] || [ "$redirect" = "$location" ]; }; then
      ok=true
      break
    fi
    sleep 10
  done
  echo "$method $url → $status${redirect:+ ($redirect)} $([ "$ok" = true ] && echo ok || echo "FAILED, expected $(jq -c .expect <<< "$route")")"
  if [ "$ok" != true ]; then
    failed=1
    echo "::error::$method $url answered $status, its smoke annotations expect $(jq -r '.expect | join(" or ")' <<< "$route")${location:+ to $location}"
  fi
  update --argjson route "$route" --arg url "$url" --argjson status "$status" --argjson ok "$ok" \
    '.probes += [{url: $url, path: $route.path, method: $route.method, expect: $route.expect, status: $status, ok: $ok}]'
done <<< "$routes"
if [ "$failed" -ne 0 ]; then exit 1; fi
update '.outcome = "success"'
