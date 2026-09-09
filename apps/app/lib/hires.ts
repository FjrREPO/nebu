/**
 * Which agents a wallet has hired, from the grants the panels stored.
 *
 * A hire belongs to the agent wallet that signed for it, so the key carries
 * that address — two connected wallets on one laptop have two agent wallets
 * and two sets of hires. Read in two places, kept in one.
 */
export const grantKey = (id: string, agentWallet: `0x${string}`) =>
  `nebu2.grant.${id}.${agentWallet.toLowerCase()}`;

/** Grants written before hires were scoped, adopted once by their owner. */
export const legacyGrantKey = (id: string) => `nebu2.grant.${id}`;

export function hiredAgents(agentWallet: string | null): string[] {
  if (!agentWallet) return [];
  try {
    const tail = `.${agentWallet.toLowerCase()}`;
    return Object.keys(localStorage)
      .filter((key) => key.startsWith("nebu2.grant.") && key.endsWith(tail))
      .map((key) => key.slice("nebu2.grant.".length, -tail.length));
  } catch {
    // Blocked storage means no hires we can see, which is what it looks like.
    return [];
  }
}
