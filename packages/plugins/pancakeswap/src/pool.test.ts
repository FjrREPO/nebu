import assert from "node:assert/strict";
import {
  feesEarned,
  formatPrice,
  inRange,
  priceToTick,
  snapToSpacing,
  tickToPrice,
} from "./pool.ts";
import { driftPastRange, halfWidthTicks } from "./rebalancer.ts";

assert.equal(inRange(0, -100, 100), true);
assert.equal(inRange(-100, -100, 100), true, "lower tick is inclusive");
assert.equal(inRange(100, -100, 100), false, "upper tick is exclusive");
assert.equal(inRange(-101, -100, 100), false);

// Tick 0 is price 1 when both tokens share decimals.
assert.equal(tickToPrice(0, 18, 18), 1);
// WBNB/USDT at tick -66058 is ~1350 USDT per BNB once decimals cancel out.
const bnb = tickToPrice(-66058, 18, 18);
assert.ok(bnb > 0.00135 && bnb < 0.00136, `unexpected raw price ${bnb}`);
// A price round-trips back to the tick it came from.
assert.equal(priceToTick(tickToPrice(-66058, 18, 18), 18, 18), -66058);
// Decimal skew is applied, not ignored: USDC (6) against WBNB (18).
assert.equal(tickToPrice(0, 18, 6), 10 ** 12);

assert.equal(snapToSpacing(-66058, 10), -66060);
assert.equal(snapToSpacing(7, 10), 10);
assert.equal(snapToSpacing(-7, 10), -10);

assert.equal(formatPrice(1350.123456), "1350.1");
assert.equal(formatPrice(1.23456789), "1.2346");
assert.equal(formatPrice(0.000012345678), "0.000012346");
// Either side of 1 the same number of figures, which is the point.
assert.equal(formatPrice(0.9985012), "0.9985");
assert.equal(formatPrice(1.0038), "1.0038");
console.log("ok");

// Fees earned: the position is in range, the pool has accrued 3 units of fee
// growth per unit of liquidity inside, and the position last saw 1.
{
  const Q128 = 1n << 128n;
  const earned = feesEarned({
    liquidity: 1_000n,
    tickCurrent: 0,
    tickLower: -10,
    tickUpper: 10,
    feeGrowthGlobalX128: 3n * Q128,
    feeGrowthOutsideLowerX128: 0n,
    feeGrowthOutsideUpperX128: 0n,
    feeGrowthInsideLastX128: 1n * Q128,
    owed: 5n,
  });
  assert.equal(earned, 5n + 2_000n, "two units of growth on 1000 liquidity, plus what was owed");
}

// The counters are allowed to overflow, and the difference still has to work.
{
  const Q128 = 1n << 128n;
  const Q256 = 1n << 256n;
  const earned = feesEarned({
    liquidity: 1n,
    tickCurrent: 0,
    tickLower: -10,
    tickUpper: 10,
    // Global has wrapped past the end; the position's last reading has not.
    feeGrowthGlobalX128: 2n * Q128,
    feeGrowthOutsideLowerX128: 0n,
    feeGrowthOutsideUpperX128: 0n,
    feeGrowthInsideLastX128: Q256 - Q128,
    owed: 0n,
  });
  assert.equal(earned, 3n, "wrapping subtraction gives three units, not a vast one");
}

// Out of range below: everything the pool earned happened above the position.
assert.equal(
  feesEarned({
    liquidity: 1_000n,
    tickCurrent: -50,
    tickLower: -10,
    tickUpper: 10,
    feeGrowthGlobalX128: 5n * (1n << 128n),
    feeGrowthOutsideLowerX128: 5n * (1n << 128n),
    feeGrowthOutsideUpperX128: 5n * (1n << 128n),
    feeGrowthInsideLastX128: 0n,
    owed: 0n,
  }),
  0n,
);

// Range width follows how much the pair actually moves, and falls back to the
// width it had when there is no history to go on.
{
  const pos = { tickLower: -1000, tickUpper: 1000, tick: 0, spacing: 10 };
  assert.equal(halfWidthTicks(pos, null), 1000, "no measurement keeps the old width");
  // Two standard deviations of a 5% day is about a 10% band either side.
  const calm = halfWidthTicks(pos, 0.05);
  const wild = halfWidthTicks(pos, 0.4);
  assert.ok(calm < wild, "a wilder pair gets a wider range");
  assert.ok(calm > 0 && calm < 2000, `calm width looked wrong: ${calm}`);
}

// Drift is measured against the boundary, and zero while still inside.
{
  assert.equal(driftPastRange({ tick: 0, tickLower: -100, tickUpper: 100 }), 0);
  const out = driftPastRange({ tick: 1100, tickLower: -100, tickUpper: 100 });
  assert.ok(out > 0.09 && out < 0.12, `1000 ticks past should be ~10%, got ${out}`);
}
