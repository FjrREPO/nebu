/**
 * How much a thing actually moves, from the candles the agents already pull.
 *
 * Every agent here made a decision that needed this and did not have it: a
 * range was recentred at whatever width it happened to have, a floor was
 * defended at 1.5 whether the collateral was a stablecoin or a memecoin. The
 * number that separates those cases is the same one in both places.
 */
import type { SeriesPoint } from "./types.ts";

/** Natural-log returns between consecutive closes. */
function logReturns(points: SeriesPoint[]) {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1].v;
    const after = points[i].v;
    if (before > 0 && after > 0) out.push(Math.log(after / before));
  }
  return out;
}

/**
 * Standard deviation of hourly returns, scaled to a day.
 *
 * Returned as a fraction: 0.04 means a typical day moves it about 4%. Null
 * when there is not enough history to say, which is a different thing from
 * "it does not move" and callers must not confuse the two.
 */
export function dailyVolatility(points: SeriesPoint[]): number | null {
  const returns = logReturns(points);
  if (returns.length < 6) return null;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const hourly = Math.sqrt(variance);
  return hourly * Math.sqrt(24);
}

/**
 * Roughly how long until a move of `distance` would be unusual rather than
 * expected, given how much this thing moves in a day.
 *
 * A random walk covers ground with the square root of time, so a move twice as
 * far takes four times as long to become likely. Days, and honestly an
 * estimate — it says when to start paying attention, not when something will
 * happen.
 */
export function daysToMove(distance: number, daily: number): number | null {
  if (!(daily > 0) || !(distance > 0)) return null;
  return (distance / daily) ** 2;
}

/**
 * The standard normal, close enough for a warning light.
 *
 * Abramowitz & Stegun 26.2.17, mirrored for negatives — a few decimal places
 * of accuracy, no dependency, and nothing here is a pricing model.
 */
function normalCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const density = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail =
    density *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

/**
 * The odds a random walk touches something `days` of ordinary movement away,
 * at some point inside `horizon` days.
 *
 * Not the odds of ending up there — of ever getting there, which is the one
 * that matters when the barrier is a liquidation. Twice the chance of being
 * past it at the end, by the reflection principle.
 */
export function touchOdds(days: number | null, horizon: number): number {
  if (days === null || !(days > 0) || !(horizon > 0)) return 0;
  return Math.min(1, 2 * normalCdf(-Math.sqrt(days / horizon)));
}
