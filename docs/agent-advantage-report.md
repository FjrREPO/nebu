# Agent Advantage Report

Three real tasks on BNB Smart Chain, done with a nebu agent and done by hand.
Task 2 is the trading/security one the brief asks for.

Agent timings are measured — `performance.now()` around the actual plugin
calls, public BSC dataseeds, no private RPC, cold cache. They were taken on
8 September 2026 against wallet `0x1e01000ba272c96013c913a6a6bC61722E24E9EB`,
and the output each call returned is printed below so anyone can re-run them.

Manual timings are **estimates**, presented as the step list they came from
rather than as a stopwatch claim. Every step is a real lookup or calculation
the task genuinely requires; count them and judge the estimate.

## What changed since the first draft

The first version of this report measured an agent that did the arithmetic
while the user still made the decisions — you told it which pool, which asset,
which position id. It no longer works that way. Each agent is handed one thing,
a wallet address, and picks its own venue from the screen it already runs.

That moves the comparison. The question is no longer "how fast can you compute
a fee APR", it is "how many pools did you look at before you chose".

---

## Task 1 — Pick a pool and size a trading range for it

**By hand**

1. Open the PancakeSwap info page and list V3 pools on BNB Chain.
2. For each candidate, read TVL and 24h volume.
3. Compute fee APR yourself: `volume × feeTier × 365 ÷ TVL`, per pool.
4. Check swap count, to tell real flow from one whale round-tripping.
5. Check pool age — a three-day-old pool at 400% APR is usually a trap.
6. Pick a range. Too wide earns little, too tight falls out by morning; sizing
   it properly means looking at what the pair actually did recently.
7. Swap BNB into both sides at roughly the right ratio.
8. Mint, or place the ladder.

Eight steps, three of them arithmetic, one of them a judgement call with no
number attached to it. Estimate: **30–45 minutes**, and the range is a guess.

**With the agent**

```
autoParams (picks its own venue)               5973 ms
  -> FORM/USDT 0.25% moved 39.2% in 48h, so the ladder spans that
     either side of spot
status                                          265 ms
  -> Grid says sell
plan (with calldata)                            380 ms
  -> 2 tx · Sell 7.5907 USDT to bring the wallet back to the
     ladder's 55.0% FORM target
```

The wallet already holds both sides here, so the move is a rebalance rather
than an opening — the screening and the range sizing are the same either way.
`autoParams` is the slow line because it is the cold one: the pool feed is a
free tier and requests are spaced two seconds apart to stay inside it.

Sixty pools screened, filtered on liquidity, volume, swap rate and age, ranked
on fee APR. The range is not a default: it is the pair's own 48-hour movement,
so a quiet pair gets a tight ladder and a violent one gets a wide one.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~30–45 min | free | one pool you had time to check, a guessed range |
| Agent | 6.6 s | free (no API key) | 60 screened, range sized from measured movement, calldata ready |

---

## Task 2 — Decide whether a loan is about to be liquidated, and size the fix
*(the trading / security task)*

**By hand**

1. Open Aave, search the address, read the health factor.
2. Decide whether 1.26 is close enough to 1.00 to act on. Nothing on screen
   answers that; you pick a floor.
3. To restore a target health factor you need
   `debt − collateral × liquidationThreshold ÷ targetHF`. The weighted
   liquidation threshold is not on the dashboard — it is per-asset, and you
   weight it yourself.
4. Work out which debt to repay. Three borrows, three answers, and only the
   largest moves the number meaningfully.
5. Convert the USD repayment into token units at the **oracle** price, not the
   market price, because that is what the health factor uses.
6. Approve, then repay, with the right rate mode.

Estimate: **15–25 minutes**, and steps 3 and 5 are where people get it wrong.
Repaying too little and believing you are safe is the expensive failure.

**With the agent**

```
autoParams                                      126 ms
  -> Loan is at 1.26, under the 1.5 floor.
status                                          123 ms
  -> At risk: 1.26
plan (with calldata)                            997 ms
  -> 1 tx · Repay 311.435 USDT (about $311.32) to lift the health
     factor from 1.26 back to 1.5
```

It reads collateral, debt, the weighted threshold and the health factor in one
batched call, picks a floor a step above where the loan sits, sizes the
repayment against that threshold, aims at the largest debt by oracle value,
caps at what is actually owed, and approves the exact amount — never unlimited.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~15–25 min | gas for approve + repay | a repayment you estimated |
| Agent | 1.2 s | same gas, exact allowance | a repayment derived from the threshold |

Same gas, same transactions. What changes is whether the amount is right. An
undersized repayment leaves the position liquidatable and costs the 5%+
liquidation penalty on the whole position — that is the real cost line.

---

## Task 3 — Find where a stablecoin earns most, and move it there

**By hand**

1. Open Aave, read the supply APY for the asset.
2. Open Venus, read its number.
3. Notice they are not the same kind of number. Aave publishes a per-second
   rate in ray; Venus publishes a per-block rate. Comparing them means
   compounding both.
4. For Venus that needs blocks per year — and BSC has changed its block time
   three times (3s, 1.5s, 0.75s). A stale constant is off by 2–6×.
5. Repeat for every asset you might rotate into.
6. Swap in, approve, supply.

Estimate: **10–15 minutes per asset**, and the block-time trap means most
by-hand comparisons are quietly wrong.

**With the agent**

```
autoParams                                      761 ms
  -> FDUSD pays 8.47% on Aave V3, the best of 8 assets listed on both
status                                          494 ms
  -> Ready to deploy 0.0074 BNB
plan (with calldata)                            985 ms
  -> 5 tx · Turn 0.00744172 BNB into FDUSD and supply it to
     Aave V3 at 8.47%
```

Sixteen rates, each compounded from its own protocol's unit. The block time
behind the Venus figures is measured from chain — a 1,000-block sample — not
hardcoded.

| | Time | Cost | Output |
|---|---|---|---|
| Manual | ~10–15 min per asset | free | two numbers, often not comparable |
| Agent | 2.2 s for 8 assets | free | 16 rates, correctly annualised, plus the route in |

---

## What this actually shows

The honest summary is not "agents are faster". Someone who knows what they are
doing reaches the same answers.

What changes:

- **Coverage.** The agent screens sixty pools and eight assets because it costs
  nothing to. A person looks at what fits on one screen.
- **The arithmetic that quietly fails.** Annualising a per-block rate, or
  sizing a repayment against a weighted liquidation threshold. Those are the
  two places nebu unit-tests its maths.
- **The judgement calls get a number behind them.** A grid range picked by feel
  becomes a range measured from the pair's own volatility.
- **Nothing is delegated by default.** Every task above ends with transactions
  in your wallet, unsigned. Hire the agent with a scoped, capped, expiring
  session and it signs them itself — inside limits the account contract
  enforces, revocable in one transaction.

## The session, proven on chain

The claim that an agent can act on its own inside limits you set is only worth
as much as the transactions behind it. Run on BNB Smart Chain testnet from
`0x38d6CDC918f0f37f59a9f770987e1216B27987CC`:

| Step | Transaction |
|---|---|
| Grant a scoped session | [`0x6f308b63…`](https://testnet.bscscan.com/tx/0x6f308b632c3f65ca0d6b0554622471d2be8a1fa208e8bd4db95c126ab016b288) |
| Session acts, no admin signature | [`0xfebf7a02…`](https://testnet.bscscan.com/tx/0xfebf7a02c6cfd429bbeb81691997baf6563fa1692c626f766a31991956afd345) |
| Revoke | [`0xbbdc54d5…`](https://testnet.bscscan.com/tx/0xbbdc54d5ccb6649c2ff676783d07a4e0707ccfaeb235ecf9711c272f078307c1) |

The KeyStore is the part worth reading. Before the grant the wallet had two
authorized keys; after it, three; after the revoke, two again:

```
after grant    0x95377f87…  0x454742ff…  0x33b5818f…   <- the session key
after revoke   0x95377f87…  0x454742ff…
```

The middle transaction was signed by the session key alone. The admin key did
not sign it, and after the third transaction that session key cannot sign for
this wallet again.

Reproduce with `NEBU_ADMIN_KEY=0x… pnpm --filter @nebu/session demo`.

## What running it on chain caught

Two bugs that no amount of reading would have found, both from the same root:
the grant described the *rebalance* an agent does, not the *deposit* it starts
from.

**A session with token allowances and no native one cannot wrap BNB.** The
relay rejected the first execute with `NoSpendPermissions`. Native value is a
separate permission from any token allowance, and wrapping a deposit moves
native value — so `SessionScope` grew `nativeSpend`, and every agent that can
bootstrap now asks for it.

**No scope listed the wrapper or the router.** Hiring an agent, depositing BNB
and pressing Run would have reverted at validation: the plan wraps through
WBNB and swaps through the smart router, and the grant allowed neither. Every
scope now covers the opening move, and the rebalancer's no longer demands a
position id that a fresh wallet does not have.

## Reproducing this

```bash
pnpm install
NEBU_WALLET=0x... pnpm --filter @nebu/agents start
```

The runner takes one address and asks every agent what it would do with what
is in that wallet. The timings above came from wrapping `autoParams`, `status`
and `plan` in `performance.now()` around the same calls it makes.

Live figures move — health factors change, pool APRs move, the best asset
rotates — so re-running gives different values with the same shape.
