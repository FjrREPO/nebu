# Deploying nebu

Live at **https://nebu.ifajar.dev**

Coolify builds and runs it. The host also runs nginx on 80/443 with a vhost per
domain — Coolify's own proxy is not in use here — so the container publishes a
fixed host port and the existing vhost proxies to it.

```
nebu.ifajar.dev ──nginx (TLS, certs in ~/le/config)──> host :3016 ──> container :3000
```

| | |
|---|---|
| Project | `nebu` · `jnbyogr81eiuplqfsoz9pp4n` |
| Application | `nebu-marketplace` · `vsgbjhvdsn4g21o8ihhjq2hc` |
| Server | `localhost` · `tqvd5nk6ik99fpmdenxd9jnx` |
| Build | Dockerfile at the repo root, `main` branch |
| Port mapping | `3016:3000` |

## Redeploying

Through the Coolify UI, or with an API token from Settings → API Tokens:

```bash
curl -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://localhost:8000/api/v1/deploy?uuid=vsgbjhvdsn4g21o8ihhjq2hc"
```

Coolify clones the repo itself, so nothing needs to be checked out on the host.

## The build

`Dockerfile` at the repo root copies the whole workspace, because `apps/app`
imports the plugin packages as TypeScript source — there is no published build
to install instead. Next's standalone output traces from the repo root for the
same reason, and the runner stage carries only what that trace produced.

`NEXT_PUBLIC_SESSION_NETWORK` defaults to `testnet` as a build arg. Set it to
`mainnet` in Coolify's build variables to grant sessions against live
protocols — a grant registers a key on chain and costs a real fee.

## What this replaced

`nebu.ifajar.dev` previously served the `~/lp-auto` project through pm2 process
`lp-dapp` on the same port. That process is stopped, not deleted:

```bash
pm2 start lp-dapp    # after stopping the Coolify app, which holds :3016
```
