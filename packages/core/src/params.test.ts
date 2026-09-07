import assert from "node:assert/strict";
import { requireAddress, requireInt } from "./params.ts";
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
console.log("ok");
