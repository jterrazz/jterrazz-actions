# Secrets

Deploy-time secrets live in Infisical, project `jterrazz`, environment `prod`,
path `/jterrazz-actions`. A consuming repository stores two GitHub secrets and
nothing else.

| GitHub secret             | What it is                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `INFISICAL_CLIENT_ID`     | Infisical universal-auth client ID, read-only, scoped to `/jterrazz-actions` |
| `INFISICAL_CLIENT_SECRET` | Its secret                                                           |

`infra-connect` exchanges them for the connectivity secrets, which it exports
as environment variables for the rest of the job:
`TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`,
`DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD`, and for deploys
`KUBECONFIG_BASE64`.
