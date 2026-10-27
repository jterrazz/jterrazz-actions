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
ids and audiences) are not secrets. Infisical, Tailscale and the apiserver
each trust a `jterrazz` workflow on `main` or on a `v*` tag, the ref a
`deploy: release` environment ships from: Infisical's identity through one
subject pattern, Tailscale through two trust credentials, one per ref, since a
credential matches one subject (the comments in
`actions/infra-connect/action.yaml` own the exact subjects). A pull request's
run, or a branch's, is trusted by none of them, so it cannot deploy.

`registry-credentials`, the pull secret a pod mounts, is never handed to the
chart: the Infisical operator syncs it into the namespace. What an app's own
runtime secrets are, and where they live (`/<app>` in project
`studio-infrastructure`), is `studio-infrastructure`'s deploy contract.

`release-npm.yaml` hands `npm publish` no token either: its publish job grants
`id-token: write`, which provenance signs with and npm's trusted publishing
authenticates with.
