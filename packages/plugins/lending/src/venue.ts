export type Venue = {
  protocol: string;
  apy: number;
  /** What the wallet already has supplied there, in whole underlying units. */
  supplied: number;
};

export type Move = { from: Venue; to: Venue; gainBps: number };

/**
 * Move the funded venue to the best-paying one, but only when the spread beats
 * the caller's floor — two gas payments to chase four basis points is a loss.
 */
export function bestMove(venues: Venue[], minGainBps: number): Move | null {
  const funded = venues.filter((venue) => venue.supplied > 0);
  if (funded.length === 0) return null;

  const from = funded.reduce((a, b) => (b.supplied > a.supplied ? b : a));
  const to = venues.reduce((a, b) => (b.apy > a.apy ? b : a));
  if (to.protocol === from.protocol) return null;

  const gainBps = Math.round((to.apy - from.apy) * 10_000);
  return gainBps >= minGainBps ? { from, to, gainBps } : null;
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
