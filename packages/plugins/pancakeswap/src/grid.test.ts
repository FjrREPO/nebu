import assert from "node:assert/strict";
import { gridLines, gridsThatPay, targetQuoteShare } from "./grid.ts";

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

// Cells have to be worth crossing: a dearer pool gets a coarser ladder.
{
  const cheap = gridsThatPay(0.95, 1.05, 0.01); // 0.01% pool
  const dear = gridsThatPay(0.95, 1.05, 1); // 1% pool
  assert.ok(cheap > dear, `cheap ${cheap} should allow more cells than dear ${dear}`);

  // On a 1% pool a round trip costs 2%, so cells must clear 6% — a ±5% band
  // barely fits one or two.
  assert.ok(dear <= 2, `1% pool over a 10% range should be coarse, got ${dear}`);

  // Never fewer than two lines, or it is not a ladder.
  assert.equal(gridsThatPay(1, 1.001, 5), 2);
  // And never absurdly many.
  assert.ok(gridsThatPay(0.01, 100, 0.01) <= 50);
}
