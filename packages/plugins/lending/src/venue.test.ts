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

// A crowded destination has to pay more than a quiet one to be worth moving to.
{
  const from = { protocol: "Venus", apy: 0.02, supplied: 100, used: 0.4 };
  const quiet = { protocol: "Aave V3", apy: 0.03, supplied: 0, used: 0.5 };
  const crowded = { protocol: "Aave V3", apy: 0.03, supplied: 0, used: 0.95 };

  assert.ok(bestMove([from, quiet], 25), "100bps into a quiet market is worth it");
  assert.equal(bestMove([from, crowded], 25), null, "the same 100bps into a crowded one is not");

  // Pay enough and it is worth it even so.
  const paying = { protocol: "Aave V3", apy: 0.055, supplied: 0, used: 0.95 };
  assert.ok(bestMove([from, paying], 25), "350bps clears the premium");

  // Leaving a crowded market is never penalised — that is the way out.
  const stuck = { protocol: "Aave V3", apy: 0.02, supplied: 100, used: 0.95 };
  const wayOut = { protocol: "Venus", apy: 0.03, supplied: 0, used: 0.5 };
  assert.ok(bestMove([stuck, wayOut], 25), "moving out of a crowded market is not penalised");
}
