# Deploying nebu

Live at **https://nebu.ifajar.dev**

The host runs nginx on 80/443 with a vhost per domain, and pm2 for the
processes. Coolify is on the same box but is not in this path — the nebu vhost
predates it and proxies straight to a port.

## How it is wired

```
nebu.ifajar.dev ──nginx (TLS, certs in ~/le/config)──> 127.0.0.1:3016 ──pm2 "nebu-app"──> next start
```

Port 3016 is fixed by the vhost. The app is told which port to bind by
`run-app.sh`, so nothing needs root to change what is served — swapping the
process on that port is the whole deploy.

## First install

```bash
ssh cuyvps
git clone https://github.com/FjrREPO/nebu ~/nebu-agents
cd ~/nebu-agents && pnpm install
NEXT_PUBLIC_SESSION_NETWORK=testnet pnpm --filter @nebu/app build
pm2 start ~/nebu-agents/run-app.sh --name nebu-app && pm2 save
```

## Updating

```bash
ssh cuyvps 'cd ~/nebu-agents && git fetch --depth 1 origin main && git reset --hard origin/main \
  && pnpm install && NEXT_PUBLIC_SESSION_NETWORK=testnet pnpm --filter @nebu/app build \
  && pm2 restart nebu-app'
```

## Moving the domain to a different port

`deploy/point-domain.sh` rewrites the vhost's upstream and reloads nginx. It
needs a sudo that can write to `/etc/nginx/sites-enabled`; on this box sudo is
NOPASSWD only for `nginx` and `systemctl reload nginx`, so the deploy above
avoids it entirely by taking over the port instead.

## What this replaced

`nebu.ifajar.dev` previously served the `~/lp-auto` project through pm2
process `lp-dapp` on the same port. That process is stopped, not deleted:

```bash
pm2 stop nebu-app && pm2 start lp-dapp    # put the old site back
```
