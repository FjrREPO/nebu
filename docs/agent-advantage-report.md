# Agent Advantage Report

Three real tasks on BNB Smart Chain, done with a nebu agent and done by hand.
Task 2 is the trading/security one the brief asks for.

Agent timings are measured — `performance.now()` around the actual plugin call,
public BSC dataseeds, no private RPC, cold cache. They were taken on 8 September
2026 and the numbers they returned are printed below so anyone can re-run them
and see comparable output.

Manual timings are **estimates**, and are presented as the step list they came
from rather than as a stopwatch claim. Every step is a real lookup or
calculation the task genuinely requires; count them and judge the estimate.

---

## Task 1 — Pick a PancakeSwap V3 pool worth providing liquidity to

**By hand**

1. Open the PancakeSwap info page and list V3 pools on BNB Chain.
2. For each candidate, read TVL and 24h volume.
3. Compute fee APR yourself: `volume × feeTier × 365 ÷ TVL`. The site shows the
   fee tier in the pool title, so this is per-pool arithmetic.
4. Check swap count to tell real flow from one whale round-tripping.
5. Check pool age, because a three-day-old pool with a 400% APR is usually a
   trap, not an opportunity.
6. Repeat across enough pools to be confident you saw the best one.

Six steps per pool, three of them arithmetic. Twenty pools is an evening.
Estimate: **20–30 minutes** for a shortlist you half-trust.

**With the agent** — `livePools()` then `shortlist()`

```
task1  pool shortlist (60 scanned)               762 ms
       -> 33 cleared, best 475.8% (DOGE/WBNB)
```

Sixty pools scanned, thirty-three past the floor ($250k liquidity, $100k daily
volume, 20 swaps/hour, at least a week old), ranked by fee APR. Second call
inside a minute: **0 ms**, the feed is cached.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~20–30 min | free | a handful of pools, arithmetic done by hand |
| Agent | 0.76 s | free (no API key) | 60 scanned, 33 ranked, screening rules stated and unit-tested |

The difference is not really speed. It is that the manual version never scans
sixty pools, so the answer is drawn from whatever fitted on the first screen.

---

## Task 2 — Decide whether a lending position is about to be liquidated, and size the fix
*(the trading / security task)*

Position: `0x1e01000ba272c96013c913a6a6bC61722E24E9EB` on Aave V3, BNB Chain.

**By hand**

1. Open Aave, connect or search the address, read the health factor.
2. Decide whether 1.29 is close enough to 1.00 to act on. There is no answer on
   the screen; you have to pick a floor.
3. To restore a target health factor you need the repayment, which means
   `debt − collateral × liquidationThreshold ÷ targetHF`. The weighted
   liquidation threshold is not on the dashboard — it is per-asset, and you have
   to weight it yourself.
4. Work out which debt to repay. A wallet with three borrows has three answers,
   and only the largest one moves the number meaningfully.
5. Convert the USD repayment into token units at the oracle price — the oracle
   price, not the market price, because that is what the health factor uses.
6. Approve, then repay, with the right rate mode.

Estimate: **15–25 minutes**, and steps 3 and 5 are where people get it wrong.
Repaying too little and thinking you are safe is the expensive failure here.

**With the agent** — `healthMonitor.status()` then `.plan()`

```
task2  health read                               680 ms
task2  repayment plan with calldata             1421 ms
       -> At risk: 1.29
       -> Repay 270.870 USDT (about $270.83) to lift the health factor
          from 1.29 back to 1.5.
```

The agent reads collateral, debt, the weighted liquidation threshold and the
health factor in one batched call, sizes the repayment against your floor, picks
the largest debt by oracle value, caps the repayment at what is actually owed,
and returns approve + repay calldata. It approves the exact amount, never an
unlimited allowance.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~15–25 min | gas for approve + repay | a repayment you estimated |
| Agent | 2.1 s | same gas, exact allowance | a repayment derived from the threshold, aimed at the largest debt |

Same gas, same two transactions. What changes is whether the amount is right.
An under-sized repayment leaves the position liquidatable and costs the 5%+
liquidation penalty on the whole position — that is the real cost line.

---

## Task 3 — Find where a stablecoin earns most, Aave V3 or Venus

**By hand**

1. Open Aave, read the supply APY for the asset.
2. Open Venus, read its number.
3. Notice they are not the same kind of number. Aave publishes a per-second rate
   in ray; Venus publishes a per-block rate. Comparing them means compounding
   both to an annual figure.
4. For Venus that needs blocks per year — and BSC has changed its block time
   three times (3s, then 1.5s, then 0.75s). A stale constant is off by 2–6×.
5. Repeat for every asset you might rotate into.

Estimate: **10–15 minutes** for one asset, and the block-time trap means most
by-hand comparisons are quietly wrong.

**With the agent** — `yieldOptimizer.insights()`

```
task3  aave vs venus radar (8 assets)           3956 ms
       -> best 8.95% FDUSD, spread 604 bps
```

Eight assets, both venues, each rate compounded from its own unit. The block
time behind the Venus figure is measured from chain — a 1,000-block sample — not
hardcoded.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~10–15 min per asset | free | two numbers, often not comparable |
| Agent | 4.0 s for 8 assets | free | 16 rates, correctly annualised, spread in bps |

---

## What this actually shows

The honest summary is not "agents are faster". A person who knows what they are
doing gets to the same answer.

What changes:

- **Coverage.** The agent looks at sixty pools and eight assets because it costs
  nothing to. A person looks at what fits on one screen.
- **The arithmetic that is easy to get wrong.** Annualising a per-block rate, or
  sizing a repayment against a weighted liquidation threshold, is where manual
  work quietly fails. Those are the two places nebu unit-tests its maths.
- **Nothing is delegated.** Every task above ends with transactions in your
  wallet, unsigned. The agent does the reading and the arithmetic; the decision
  and the signature stay yours.

## Reproducing this

```bash
pnpm install
pnpm --filter @nebu/agents start   # ticks all four agents against a watchlist
```

The timings came from a script that wraps `livePools`, `healthMonitor.status`,
`healthMonitor.plan` and `yieldOptimizer.insights` in `performance.now()`.
Live figures move — health factors change, pool APRs move — so re-running will
give different values with the same shape.
