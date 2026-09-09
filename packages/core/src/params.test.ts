import assert from "node:assert/strict";
import { cached, fallbackLogo } from "./market.ts";
import { plainAmount, requireAddress, requireInt } from "./params.ts";
import { dailyVolatility, daysToMove, touchOdds } from "./risk.ts";
import { InvalidParams } from "./types.ts";

const pool = "0x36696169c63e42cd08ce11f5deebbcebae652050";

// Checksums a lowercase address rather than rejecting it.
assert.equal(requireAddress({ pool }, "pool"), "0x36696169C63e42cd08ce11f5deeBbCeBae652050");
assert.equal(requireAddress({ pool: ` ${pool} ` }, "pool").length, 42, "trims whitespace");
assert.throws(() => requireAddress({}, "pool"), InvalidParams);
assert.throws(() => requireAddress({ pool: "0xdead" }, "pool"), InvalidParams);

assert.equal(requireInt({ t: "-66058" }, "t"), -66058);
assert.throws(() => requireInt({ t: "1.5" }, "t"), InvalidParams);
assert.throws(() => requireInt({ t: "" }, "t"), InvalidParams);
assert.throws(() => requireInt({ t: "abc" }, "t"), InvalidParams);
// A balance in the millions must not arrive as "9.36847e+7", and a BNB budget
// must not arrive with all eighteen of its decimal places.
assert.equal(plainAmount(93_684_700), "93,684,700");
assert.equal(plainAmount(0.073713930548855111), "0.07371393");
assert.equal(plainAmount(310.6501234), "310.6501");
assert.equal(plainAmount(Number.NaN), "0");

// PancakeSwap's icon host answers on the checksummed address and 404s on the
// lowercase one, so the fallback has to checksum whatever it is handed.
assert.equal(
  fallbackLogo("0x55d398326f99059ff775485246999027b3197955"),
  "https://tokens.pancakeswap.finance/images/0x55d398326f99059fF775485246999027B3197955.png",
);
assert.equal(fallbackLogo("not-an-address"), undefined);

console.log("ok");

// A refused refresh must hand back the last thing that worked rather than
// nothing — that difference is a chart staying on screen or vanishing.
{
  let attempt = 0;
  const flaky = () =>
    cached(
      "flaky",
      async () => {
        attempt += 1;
        if (attempt === 2) throw new Error("429");
        return `answer ${attempt}`;
      },
      0,
    );

  assert.equal(await flaky(), "answer 1");
  assert.equal(await flaky(), "answer 1", "a refusal falls back to the last good value");
  assert.equal(await flaky(), "answer 3", "and the next call still retries");
}

// With nothing cached yet there is nothing to fall back to, so it still throws.
await assert.rejects(
  cached("never-worked", async () => {
    throw new Error("429");
  }),
);

// Volatility: a series that walks a steady 1% an hour has a daily figure of
// about 1% * sqrt(24), and a flat series has no deviation to measure.
{
  const walk = (steps: number[]) => steps.map((v, i) => ({ t: i * 3600, v }));
  const alternating = walk([100, 101, 100, 101, 100, 101, 100, 101, 100, 101]);
  const vol = dailyVolatility(alternating);
  assert.ok(vol !== null && vol > 0.02 && vol < 0.08, `alternating 1% gave ${vol}`);

  assert.equal(dailyVolatility(walk([100, 100, 100, 100, 100, 100, 100, 100])), 0);
  // Too little history is unknown, which is not the same as "does not move".
  assert.equal(dailyVolatility(walk([100, 101])), null);
}

// Distance and time: four times as long to travel twice as far.
{
  const near = daysToMove(0.05, 0.05);
  const far = daysToMove(0.1, 0.05);
  assert.equal(near, 1);
  assert.equal(far, 4);
  assert.equal(daysToMove(0.05, 0), null);
}

// Touching a barrier is not the same as ending past it: a line one expected
// move away is reached about a third of the time, not half.
assert.ok(Math.abs(touchOdds(365, 365) - 0.317) < 0.01);
assert.ok(touchOdds(1, 365) > 0.9, "a line a day away is all but certain over a year");
assert.ok(touchOdds(36_500, 365) < 0.02, "one a century away is not");
assert.equal(touchOdds(null, 365), 0, "and an unknown distance is not a certainty");
