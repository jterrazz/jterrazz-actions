# The composite actions

The steps the release workflows are made of. A caller uses the workflows; these
are documented because a workflow's behaviour is theirs.

| Action                                        | Does                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| [`actions/infra-connect`](../actions/infra-connect) | Fetches the secrets from Infisical, joins Tailscale as `tag:ci`, logs in to the container registry |
| [`actions/docker-build`](../actions/docker-build)   | Builds and pushes the image with Buildx                                  |
| [`actions/docker-deploy`](../actions/docker-deploy) | Deploys with `helm upgrade --install` against the shared app chart       |
| [`actions/docker-cleanup`](../actions/docker-cleanup) | Prunes old `v*` tags and runs registry garbage collection              |

## infra-connect

One step for the three connections a deploy needs. It fetches from Infisical
project `jterrazz`, environment `prod`, path `/jterrazz-actions` (all three
overridable), which exports the connectivity secrets as environment variables
for the steps that follow.

## docker-build

Buildx with `network=host`, so buildkit resolves the registry's `*.ts.net`
name through the runner's Tailscale resolver. Without it the push NXDOMAINs on
the public CNAME chain.

## docker-deploy

`helm upgrade --install <env>-<image-name>` against
`oci://registry.internal.jterrazz.com/charts/app`, with the caller's manifest
as the values file, once per resolved deployment.

It passes `meta.repository=${{ github.repository }}`, which through a reusable
workflow is still the calling repository. The app chart stamps it on the
Deployment as `app.jterrazz.com/repository`, and that annotation is the only
place the cluster records which repository rebuilds a workload:
`jterrazz-infrastructure`'s `make redeploy-apps` reads it off the live
Deployments instead of holding a list that goes stale. An app that stops
passing it drops out of the fleet rebuild.

Any `*.json` file in a `dashboards/` directory beside the manifest is passed to
the chart as `spec.dashboards.<name>`.

The Helm timeout defaults to `5m`, which is headroom for cert-manager on a
first deploy that introduces a new Certificate: DNS-01 against Cloudflare
usually takes about a minute but queues when several apps roll out at once.
Steady-state upgrades finish in seconds, so the higher default costs nothing.
