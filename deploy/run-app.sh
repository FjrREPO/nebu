#!/usr/bin/env bash
# nebu agent marketplace. Port is fixed so the nginx vhost can find it.
set -e
cd "$(dirname "$0")"
export NEXT_PUBLIC_SESSION_NETWORK=testnet
exec pnpm --filter @nebu/app exec next start -p 3016
