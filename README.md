# nebu

**https://nebu.ifajar.dev**

An agent marketplace for BNB Smart Chain. You deposit BNB; an agent takes it
from there.

Four agents ship with it, one for each thing people actually worry about: an LP
range that has drifted out and stopped earning, a price that keeps oscillating,
a deposit sitting on the worse of two lending rates, and a loan drifting toward
liquidation. Each one reads mainnet live and hands you the exact transactions
that fix what it is watching.

Nothing here is mocked. Every number on every card is a contract read made when
the page rendered.

## The four

| Agent | Watches | Does |
|---|---|---|
| **PancakeSwap V3 Rebalancer** | your position's range against the pool's live tick | exits, collects, and remints centred on the current price |
| **PancakeSwap Grid Trader** | pool price against your balance of both tokens | swaps back toward the ratio the ladder wants |
| **Lending Yield Router** | Aave V3 and Venus supply rates, side by side | moves the deposit when the spread clears your floor |
| **Aave Health Guard** | your health factor, collateral and debt | repays your largest debt just enough to lift it back |

Rates are worked out, not copied off a dashboard. Aave publishes a per-second
ray, Venus a per-block rate, and both get compounded to a real APY — with the
block time measured from chain rather than hardcoded, because BSC has changed
it three times.

## Hiring one is just a deposit

You send BNB. That is the whole configuration.

Each agent already runs a screen, so it can pick its own venue and tell you
why:

```
rebalancer  Watching position #7380654, the newest of 12 this wallet holds
grid        FORM/USDT 0.25% moved 39.2% in 48h, so the ladder spans that
            either side of spot
yield       FDUSD pays 8.47% on Aave V3, the best of 8 assets listed on both
health      Loan is at 1.26, under the 1.5 floor.
```

From a bare BNB balance, the yield router wraps, swaps into the best-paying
asset, approves and supplies — five transactions. The rebalancer buys both
sides and mints a range around spot. The health guard does nothing at all, and
says so: it defends a loan you already have, and a deposit cannot create one.

Routing lives in `packages/core/src/router.ts`. It picks the deepest V3 pool
across the fee tiers, quotes straight off `sqrtPriceX96` so decimals never
enter the arithmetic, and keeps 0.003 BNB back for gas. Every step after a swap
is sized off the swap's *floor* rather than its quote — the floor is what is
actually guaranteed to be there when the next call runs.

## Signing, or not

`plan()` hands you the transactions and your wallet signs them. Nothing is
delegated unless you ask for it.

If you do ask, grant a scoped [Altana](https://docs.altana.network) session and
the agent transacts on its own inside limits you set — which contracts it may
call, how much of which token it may move per day, and when the whole thing
expires. Every agent derives that scope from the same params `plan()` uses, so
the grant can never drift from the calls the agent actually makes. The account
contract enforces it: anything outside the grant reverts, and revoking is one
transaction that takes effect immediately.

One detail worth knowing if you build on this: native value is a separate
permission from any token allowance. A session granted without it reverts with
`NoSpendPermissions` the first time it tries to wrap BNB.

Sessions are granted on BNB Smart Chain, because that is where the agents'
calldata points. The two have to agree: a call to an address with no code
succeeds rather than reverting, so pointing a session at a chain the contracts
are not on spends gas and reports success while doing nothing. The panel
refuses when they differ. Build with `NEXT_PUBLIC_SESSION_NETWORK=testnet`
only alongside plugins that name testnet addresses.

To watch the whole lifecycle happen:

```bash
NEBU_ADMIN_KEY=0x... pnpm --filter @nebu/session demo
```

It grants, reads the key back out of the on-chain KeyStore, has the session
sign with no admin signature, revokes, and reads the KeyStore again. The
transactions from a real run are in
[the advantage report](docs/agent-advantage-report.md), alongside three tasks
timed against doing them by hand.

## Running it

```bash
pnpm install
pnpm dev                                             # everything
pnpm --filter @nebu/app dev                          # the marketplace, :3000
NEBU_WALLET=0x... pnpm --filter @nebu/agents start   # the headless runner
```

The runner takes one address, asks every agent what it would do with what is in
that wallet, and reports. Give it `NEBU_SESSION` and `NEBU_SESSION_KEY` and it
signs instead.

Set `BSC_RPC_URL` to a private endpoint for anything past a demo; the default
is a fallback list of public dataseeds batched through Multicall3.

`pnpm build`, `pnpm typecheck` and `pnpm test` run across the workspace.
Biome formats and lints, enforced on commit by husky.

## Layout

```
apps/
  app       the marketplace — Next 16, Tailwind. Also serves the HTTP API.
  api       the same registry as a standalone Hono service
  agents    headless runner: give it a wallet, it works every agent
packages/
  core      plugin contract, BSC client, routing, param validation
  session   Altana session keys: grant, run, revoke
  plugins/  pancakeswap · lending · the registry every surface reads
```

Adding an agent means writing one `AgentPlugin` and putting it in the registry.
The marketplace, the API and the runner all pick it up with nothing else
changed.

```ts
interface AgentPlugin {
  autoParams(wallet): Promise<AutoParams>;     // what it picks for itself
  status(params): Promise<AgentStatus>;        // what is true right now
  insights(params): Promise<AgentInsights>;    // the data it decided from
  series(params): Promise<AgentSeries | null>; // its own number over time
  scope(params): Promise<SessionScope>;        // narrowest session that works
  plan(params): Promise<AgentAction | null>;   // the txs, or null if idle
}
```

`plan` returns a *sequence*, because no DeFi move fits in one call — approve
then act, exit then re-enter. The wallet sends them in order and stops at the
first failure.

## API

Live on the deployment, so another team's runner can use this registry without
importing it:

```
GET /api/agents                       every agent and its param schema
GET /api/agents/:id/auto?wallet=0x…   what it picks for itself, or null
GET /api/agents/:id/status?…          live reading
GET /api/agents/:id/insights?…        the data it decided from
GET /api/agents/:id/scope?…           the narrowest session that would work
GET /api/agents/:id/plan?…            the transactions, or null
```

Bad params come back 400, chain trouble 502, CORS is open. A `null` from
`/auto` is an answer rather than a failure — it means the agent found nothing
to work with on that wallet.
