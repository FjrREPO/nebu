import assert from "node:assert/strict";
import { compactUsd, POOL_FILTER, type PoolRow, shortlist } from "./pools.ts";

const pool = (over: Partial<PoolRow>): PoolRow => ({
  address: "0x1",
  pair: "A/B",
  base: { symbol: "A", logo: null },
  quote: { symbol: "B", logo: null },
  feePercent: 0.05,
  tvlUsd: 1_000_000,
  volume24hUsd: 5_000_000,
  swapsPerHour: 100,
  feeApr: 0.9,
  ageDays: 30,
  ...over,
});

// A healthy pool survives every filter.
assert.equal(shortlist([pool({})]).length, 1);
// Thin liquidity, dead volume, no trades and brand-new pools are all dropped.
assert.equal(shortlist([pool({ tvlUsd: POOL_FILTER.minTvlUsd - 1 })]).length, 0);
assert.equal(shortlist([pool({ volume24hUsd: 1_000 })]).length, 0);
assert.equal(shortlist([pool({ swapsPerHour: 2 })]).length, 0);
assert.equal(shortlist([pool({ ageDays: 1 })]).length, 0, "honeypots are usually new");
// An absurd APR means the TVL reading is stale, not that there is free money.
assert.equal(shortlist([pool({ feeApr: 90 })]).length, 0);
assert.equal(shortlist([pool({ feeApr: 0 })]).length, 0);
// Best fee momentum first.
const ordered = shortlist([
  pool({ address: "0x1", feeApr: 0.2 }),
  pool({ address: "0x2", feeApr: 1.4 }),
]);
assert.deepEqual(
  ordered.map((row) => row.address),
  ["0x2", "0x1"],
);

assert.equal(compactUsd(1_234), "1.2K");
assert.equal(compactUsd(52_000_000), "52.0M");
assert.equal(compactUsd(940), "940");
console.log("ok");
