import assert from "node:assert/strict";
import { inRange } from "./index.ts";

assert.equal(inRange(0, -100, 100), true);
assert.equal(inRange(-100, -100, 100), true, "lower tick is inclusive");
assert.equal(inRange(100, -100, 100), false, "upper tick is exclusive");
assert.equal(inRange(-101, -100, 100), false);
assert.equal(inRange(101, -100, 100), false);
console.log("ok");
