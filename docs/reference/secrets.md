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

## Tauri signing

All optional, all passed through `secrets: inherit`. With the Apple secrets
unset the build still produces unsigned DMGs, and macOS users see an
"unverified developer" warning on first launch.

| Secret                               | What it is                                                    |
| ------------------------------------ | --------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Tauri auto-updater signing key                                  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the above                                          |
| `APPLE_CERTIFICATE`                  | Base64 of the Developer ID Application `.p12`                   |
| `APPLE_CERTIFICATE_PASSWORD`         | Password used at `.p12` export time                             |
| `APPLE_SIGNING_IDENTITY`             | The certificate's CN, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`                           | Apple ID email for notarization                                 |
| `APPLE_PASSWORD`                     | App-specific password, not the real Apple ID password           |
| `APPLE_TEAM_ID`                      | Apple Developer team ID                                         |

Generating the `.p12` for `APPLE_CERTIFICATE` needs the `-legacy` flag:

```sh
openssl pkcs12 -export -legacy \
  -inkey signing.key \
  -in cert.pem \
  -out signing.p12 \
  -name "Developer ID Application"
```

openssl 3.x defaults to PBKDF2 and AES, which `security import` on macOS cannot
read, and the failure surfaces as the misleading `MAC verification failed
(wrong password?)`. The legacy flag falls back to PBE-SHA1-3DES, which every
macOS understands.
