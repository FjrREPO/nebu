/**
 * What you have put into an agent wallet, as far as this browser saw.
 *
 * There is no server keeping accounts and the chain does not hand out a
 * deposit history without an indexer, so this is the honest half: BNB sent
 * through this app, on this device. It is enough to say whether the wallet is
 * up or down since you funded it, and the page says where the number comes
 * from rather than calling it a cost basis.
 */
export type Deposit = { at: number; bnb: number };

const key = (agentWallet: string) => `nebu2.deposits.${agentWallet.toLowerCase()}`;

export function recordDeposit(agentWallet: string, bnb: number) {
  if (!(bnb > 0)) return;
  try {
    const kept = [...depositsInto(agentWallet), { at: Date.now(), bnb }];
    localStorage.setItem(key(agentWallet), JSON.stringify(kept));
  } catch {
    // Blocked storage costs the record, not the deposit.
  }
}

export function depositsInto(agentWallet: string | null): Deposit[] {
  if (!agentWallet) return [];
  try {
    const raw = localStorage.getItem(key(agentWallet));
    if (!raw) return [];
    // The first version of this kept one running total and no dates. It is
    // still a deposit; it just does not know when it happened.
    if (!raw.startsWith("[")) {
      const total = Number(raw);
      return Number.isFinite(total) && total > 0 ? [{ at: 0, bnb: total }] : [];
    }
    const kept = JSON.parse(raw) as Deposit[];
    return Array.isArray(kept) ? kept.filter((entry) => entry.bnb > 0) : [];
  } catch {
    return [];
  }
}

export const depositedInto = (agentWallet: string | null) =>
  depositsInto(agentWallet).reduce((sum, entry) => sum + entry.bnb, 0);
