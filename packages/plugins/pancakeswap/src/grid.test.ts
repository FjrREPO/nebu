import assert from "node:assert/strict";
import { gridLines, targetQuoteShare } from "./grid.ts";

// Bottom of the range wants the least quote, top wants the most.
assert.equal(targetQuoteShare(100, 100, 200, 10), 0.05);
assert.equal(targetQuoteShare(199, 100, 200, 10), 0.95);
// Interior of cell 5 (the 6th of 10) targets that cell's centre.
assert.ok(Math.abs(targetQuoteShare(145, 100, 200, 10) - 0.55) < 1e-9);
// Interior of cell 4 sits one step lower.
assert.ok(Math.abs(targetQuoteShare(138, 100, 200, 10) - 0.45) < 1e-9);
// Monotonic: a higher price never wants less quote.
let previous = -1;
for (let p = 100; p <= 200; p += 5) {
  const share = targetQuoteShare(p, 100, 200, 10);
  assert.ok(share >= previous, `share dropped at ${p}`);
  previous = share;
}
// Prices outside the range clamp to the end cells instead of exploding.
assert.equal(targetQuoteShare(10, 100, 200, 10), 0.05);
assert.equal(targetQuoteShare(1000, 100, 200, 10), 0.95);

const lines = gridLines(100, 200, 4);
assert.equal(lines.length, 5);
assert.equal(lines[0], 100);
assert.ok(Math.abs(lines[4] - 200) < 1e-9);
// Geometric spacing: every step is the same percentage move.
const steps = lines.slice(1).map((line, i) => line / lines[i]);
for (const step of steps) assert.ok(Math.abs(step - steps[0]) < 1e-9);
console.log("ok");
