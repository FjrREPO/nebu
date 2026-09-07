import assert from "node:assert/strict";
import { bestMove, repayToReachHealth } from "./venue.ts";

const aave = { protocol: "Aave V3", apy: 0.0858, supplied: 0 };
const venus = { protocol: "Venus", apy: 0.061, supplied: 1000 };

// Funds sit in the worse venue and the spread is wide: move them.
const move = bestMove([aave, venus], 25);
assert.equal(move?.from.protocol, "Venus");
assert.equal(move?.to.protocol, "Aave V3");
assert.equal(move?.gainBps, 248);

// Same spread, but the caller wants at least 3% before paying gas twice.
assert.equal(bestMove([aave, venus], 300), null);
// Already in the best venue.
assert.equal(
  bestMove(
    [
      { ...aave, supplied: 1000 },
      { ...venus, supplied: 0 },
    ],
    25,
  ),
  null,
);
// Nothing supplied anywhere.
assert.equal(bestMove([aave, { ...venus, supplied: 0 }], 25), null);

// 1000 collateral at an 80% threshold carrying 700 debt sits at HF 1.14;
// reaching 1.5 means clearing 700 - 800/1.5 = 166.67.
assert.ok(Math.abs(repayToReachHealth(1000, 700, 8000, 1.5) - 166.6666) < 0.01);
// Already healthy: nothing to repay.
assert.equal(repayToReachHealth(1000, 100, 8000, 1.5), 0);
// No debt at all never asks for a repayment.
assert.equal(repayToReachHealth(1000, 0, 8000, 1.5), 0);
console.log("ok");
