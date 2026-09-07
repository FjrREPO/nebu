# nebu

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

## Layout

```
apps/
  app       marketplace — Next 16 + Once UI, the thing judges open
  landing   public marketing page
  api       Hono service exposing the same agents over HTTP
  agents    headless runner that ticks a watchlist on an interval
packages/
  core      plugin contract, shared BSC client, param validation
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
  status(params): Promise<AgentStatus>;        // what is true right now
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
pnpm --filter @nebu/agents start # the headless runner
```

`pnpm build`, `pnpm typecheck` and `pnpm test` run across the workspace through
Turborepo. Formatting and linting is Biome, enforced on commit by husky.

Set `BSC_RPC_URL` to a private endpoint for anything beyond a demo; the default
is a fallback list of public dataseeds, batched through Multicall3.

## HTTP API

```
GET /health
GET /agents                  # every agent and its param schema
GET /agents/:id/status?...   # live reading
GET /agents/:id/plan?...     # the transactions, or null
```

Bad params come back as 400, chain trouble as 502.
