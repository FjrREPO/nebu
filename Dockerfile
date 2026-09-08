# Build the marketplace out of the workspace it lives in.
#
# The whole repo is copied because apps/app imports the plugin packages as
# TypeScript source — there is no published build to install instead.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_SESSION_NETWORK=testnet
ENV NEXT_PUBLIC_SESSION_NETWORK=$NEXT_PUBLIC_SESSION_NETWORK
RUN pnpm --filter @nebu/app build

# Standalone ships its own minimal node_modules, so the runner stays small.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000

COPY --from=build /repo/apps/app/.next/standalone ./
COPY --from=build /repo/apps/app/.next/static ./apps/app/.next/static

EXPOSE 3000
CMD ["node", "apps/app/server.js"]
