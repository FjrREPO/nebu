# nebu

**Live: https://nebu.ifajar.dev**

An agent marketplace for BNB Smart Chain. Four agents, one per category the
brief asks for, all reading mainnet live and all able to hand you the exact
transactions that fix the position they are watching.

Nothing on the marketplace is a mock. Every headline number on every card is a
contract read performed when the page was rendered.

## The agents

| Category | Agent | Protocol | What it actually reads | What it hands you |
|---|---|---|---|---|
| Rebalancing | PancakeSwap V3 Rebalancer | PancakeSwap V3 | Your position NFT's range and the pool's live tick | `multicall(decreaseLiquidity, collect)` + approvals + `mint` on a range recentred around the live price |
| Grid trading | PancakeSwap Grid Trader | PancakeSwap V3 | Pool price and your wallet's balance of both tokens | An `exactInputSingle` swap sized to the drift, with 1% slippage protection |
| Yield optimisation | Lending Yield Router | Aave V3 + Venus | Both protocols' live supply rates for one asset, plus where your deposit sits | `withdraw` + `approve` + `supply` when the spread clears your floor |
| Health factor | Aave Health Guard | Aave V3 | Your live health factor, collateral, debt and liquidation threshold | `approve` + `repay` sized to lift the health factor back to your floor, aimed at your largest debt |

Rates are derived, not copied. Aave's per-second ray rate and Venus's
per-block rate are both compounded to a real APY, and the block time behind the
Venus figure is measured from chain rather than hardcoded — BSC has changed it
three times.

## The marketplace

| Page | What it shows |
|---|---|
| `/` | Every agent, each card carrying a live reading taken when the page rendered |
| `/agents/[id]` | The agent's stats, the table it decided from, what it can do with your wallet, and recent on-chain activity in its scope |
| `/portfolio` | Every agent pointed at a connected wallet — including the PancakeSwap position NFTs it actually holds |
| `/leaderboard` | The two boards the agents pick from: fee momentum, and Aave-vs-Venus spreads |
| `/status` | Every feed and contract the site reads, checked on load, with the known limits stated |

Pool discovery uses GeckoTerminal (free, no key) for the two numbers no
contract exposes — 24h volume and swap counts — and screens on liquidity,
volume, swap rate and pool age before an agent will touch a pool.

See [`docs/agent-advantage-report.md`](docs/agent-advantage-report.md) for three
tasks measured against doing them by hand.

## Hiring an agent is a deposit

You send BNB. That is the whole configuration.

Every agent already runs a screen — the rebalancer ranks 60 PancakeSwap pools
by fee momentum, the yield router compares 8 assets across two protocols — so
`autoParams()` lets each one pick its own venue and say why:

```
rebalancer  Watching position #7365949, the newest of 12 this wallet holds
grid        FLNCB/USDT 0.25% moved 5.0% in 48h, so the ladder spans that
            either side of spot
yield       FDUSD pays 8.46% on Aave V3, the best of 8 assets listed on both
health      Loan is at 1.27; guarding it at 1.5
```

From a BNB balance and nothing else:

| Agent | What it does with the deposit |
|---|---|
| Yield router | wrap, swap to the best-paying asset, approve, supply — 5 txs |
| Rebalancer | buy both sides, mint a range around the live price — 7 txs |
| Grid trader | split across both sides at the ratio the ladder wants |
| Health guard | nothing. It defends a loan you already have; a deposit cannot create one, and it says so rather than pretending |

Routing lives in `packages/core/src/router.ts`: it finds the deepest V3 pool
for a pair across the fee tiers by how much that pool actually holds, quotes
straight off `sqrtPriceX96` so token decimals never enter the arithmetic, and
holds 0.003 BNB back for gas. Every step after a swap is sized off the swap's
**floor**, not its quote — the floor is what is guaranteed to be there when the
next call in the sequence runs.

**Sign it yourself.** `plan()` returns the transactions, your wallet signs them.
Nothing is delegated.

**Or hire it.** Grant a scoped [Altana](https://docs.altana.network) session and
the agent transacts on its own inside limits you set:

```ts
scope(params) -> {
  calls: [{ to: "0x46A1…", label: "PancakeSwap position manager" }, …],
  spend: [{ token: "0x55d3…", symbol: "USDT", decimals: 18, suggested: "270.87" }],
}
```

Every agent derives that scope from the same params `plan()` uses, so the grant
cannot drift from the calls the agent actually makes. The account contract
enforces it — a call outside the grant reverts at validation, spend caps roll
per day, the session expires on its own, and revoking is one transaction that
takes effect immediately.

Sessions default to BNB testnet, since a grant registers a key on chain and
costs a fee. Prove the lifecycle end to end:

```bash
NEBU_ADMIN_KEY=0x... pnpm --filter @nebu/session demo
```

That grants, reads the key back out of the on-chain KeyStore, has the session
sign a transaction with no admin signature, revokes, and reads the KeyStore
again.

## Layout

```
apps/
  app       marketplace — Next 16 + Tailwind, the thing judges open
  landing   public marketing page, live counters
  api       Hono service exposing the same agents over HTTP
  agents    headless runner that ticks a watchlist on an interval
packages/
  core      plugin contract, shared BSC client, param validation
  session   Altana session keys: grant, run, revoke
  plugins/
    pancakeswap  rebalancer + grid trader
    lending      yield router + health guard (Aave V3, Venus)
    registry     the list every surface reads
```

Adding an agent means writing one `AgentPlugin` and adding it to the registry.
The marketplace, the API and the runner all pick it up with no other change.

### The plugin contract

```ts
interface AgentPlugin {
  id: string;
  category: "rebalancing" | "grid" | "yield" | "health";
  paramSchema: ParamSpec[];
  example: AgentParams;                        // live params for the card
  autoParams(wallet): Promise<AutoParams>;     // what it picks for itself
  status(params): Promise<AgentStatus>;        // what is true right now
  insights(params): Promise<AgentInsights>;    // the data it decided from
  series(params): Promise<AgentSeries | null>; // its own number over time
  scope(params): Promise<SessionScope>;        // narrowest session that works
  plan(params): Promise<AgentAction | null>;   // the txs, or null if idle
}
```

`plan` returns a *sequence* of transactions, because no DeFi move fits in one
call — approve then act, exit then re-enter. The wallet sends them in order and
stops at the first failure.

## Running it

```bash
pnpm install
pnpm dev            # everything
pnpm --filter @nebu/app dev     # just the marketplace, :3000
pnpm --filter @nebu/api start   # just the HTTP API, :3001
NEBU_WALLET=0x... pnpm --filter @nebu/agents start   # the headless runner
```

The runner takes one address. It asks every agent what it would do with what
is in that wallet, and reports. Add `NEBU_SESSION` and `NEBU_SESSION_KEY` and
it signs instead of reporting.

`pnpm build`, `pnpm typecheck` and `pnpm test` run across the workspace through
Turborepo. Formatting and linting is Biome, enforced on commit by husky.

Set `BSC_RPC_URL` to a private endpoint for anything beyond a demo; the default
is a fallback list of public dataseeds, batched through Multicall3.

## HTTP API

```
GET /health
GET /agents                  # every agent and its param schema
GET /agents/:id/auto?wallet= # what the agent picks for itself, or null
GET /agents/:id/status?...   # live reading
GET /agents/:id/plan?...     # the transactions, or null
```

Bad params come back as 400, chain trouble as 502.
