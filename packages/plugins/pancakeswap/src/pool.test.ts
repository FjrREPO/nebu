import assert from "node:assert/strict";
import { formatPrice, inRange, priceToTick, snapToSpacing, tickToPrice } from "./pool.ts";

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
