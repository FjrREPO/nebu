export type Venue = {
  protocol: string;
  apy: number;
  /** What the wallet already has supplied there, in whole underlying units. */
  supplied: number;
  /** Fraction of the market's supply already lent out, when it is known. */
  used?: number | null;
};

export type Move = { from: Venue; to: Venue; gainBps: number };

/**
 * Past this, the money is there on paper and not in practice: withdrawing
 * means waiting for a borrower to repay. Aave's rates rise with utilisation by
 * design, so the best-looking rate on the board is often the one you would
 * have the most trouble leaving.
 */
export const CROWDED = 0.9;

/** How much extra a crowded destination has to pay to be worth the trouble. */
export const CROWDED_PREMIUM_BPS = 200;

/**
 * Move the funded venue to the best-paying one, but only when the spread beats
 * the caller's floor — two gas payments to chase four basis points is a loss —
 * and only when a crowded destination pays enough to justify being hard to
 * leave.
 */
export function bestMove(venues: Venue[], minGainBps: number): Move | null {
  const funded = venues.filter((venue) => venue.supplied > 0);
  if (funded.length === 0) return null;

  const from = funded.reduce((a, b) => (b.supplied > a.supplied ? b : a));
  const to = venues.reduce((a, b) => (b.apy > a.apy ? b : a));
  if (to.protocol === from.protocol) return null;

  const gainBps = Math.round((to.apy - from.apy) * 10_000);
  const crowded = (to.used ?? 0) >= CROWDED && (from.used ?? 0) < CROWDED;
  const floor = crowded ? minGainBps + CROWDED_PREMIUM_BPS : minGainBps;
  return gainBps >= floor ? { from, to, gainBps } : null;
}

/**
 * Aave's health factor is collateral * liquidationThreshold / debt. Clearing
 * `repay` of the debt lifts it to `targetHf`; anything less still liquidates.
 */
export function repayToReachHealth(
  collateralBase: number,
  debtBase: number,
  thresholdBps: number,
  targetHf: number,
) {
  if (debtBase <= 0 || targetHf <= 0) return 0;
  const survivableDebt = (collateralBase * (thresholdBps / 10_000)) / targetHf;
  return Math.max(0, debtBase - survivableDebt);
}
