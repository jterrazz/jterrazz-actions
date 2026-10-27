# Secrets

A consuming repository stores no secret at all. Every credential a release
needs is the job's own GitHub OIDC token, exchanged at each service that
accepts it; the calling job only grants
`permissions: { contents: read, id-token: write }`.

| Service       | What the token is exchanged for                                          | Where                                                  |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Infisical     | The registry account, `DOCKER_REGISTRY_USERNAME` and `DOCKER_REGISTRY_PASSWORD`, read from project `studio-ci`, environment `prod`, path `/` | `infra-connect`, machine identity with OIDC auth       |
| Tailscale     | A node key tagged `tag:ci`, through a trust credential                   | `infra-connect`                                        |
| The cluster   | The user `github:jterrazz/<repo>`, audience `studio-infrastructure`      | `cluster-connect`, an exec plugin minting fresh tokens |

The identifiers in the actions' inputs (Infisical identity id, Tailscale client
id and audience) are not secrets. Infisical and Tailscale trust
`repo:jterrazz@18480834/*:ref:refs/heads/main` (the comments in
`actions/infra-connect/action.yaml` own the exact subjects); the apiserver
accepts a `jterrazz/<repo>` workflow on `main` or a `v*` tag. A pull
request's run is trusted by none of them, so it cannot deploy.

`registry-credentials`, the pull secret a pod mounts, is never handed to the
chart: the Infisical operator syncs it into the namespace. What an app's own
runtime secrets are, and where they live (`/<app>` in project
`studio-infrastructure`), is `studio-infrastructure`'s deploy contract.

`release-npm.yaml` hands `npm publish` no token either: its publish job grants
`id-token: write`, which provenance signs with and npm's trusted publishing
authenticates with.
