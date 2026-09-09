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
