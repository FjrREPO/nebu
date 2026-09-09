/**
 * What you have put into an agent wallet, as far as this browser saw.
 *
 * There is no server keeping accounts and the chain does not hand out a
 * deposit history without an indexer, so this is the honest half: BNB sent
 * through this app, on this device. It is enough to say whether the wallet is
 * up or down since you funded it, and the page says where the number comes
 * from rather than calling it a cost basis.
 */
const key = (agentWallet: string) => `nebu2.deposits.${agentWallet.toLowerCase()}`;

export function recordDeposit(agentWallet: string, bnb: number) {
  if (!(bnb > 0)) return;
  try {
    localStorage.setItem(key(agentWallet), String(depositedInto(agentWallet) + bnb));
  } catch {
    // Blocked storage costs the record, not the deposit.
  }
}

export function depositedInto(agentWallet: string | null): number {
  if (!agentWallet) return 0;
  try {
    const raw = Number(localStorage.getItem(key(agentWallet)));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}
