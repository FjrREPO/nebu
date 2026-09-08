import assert from "node:assert/strict";
import { fallbackLogo } from "./market.ts";
import { plainAmount, requireAddress, requireInt } from "./params.ts";
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
