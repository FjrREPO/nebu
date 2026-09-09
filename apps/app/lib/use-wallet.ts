"use client";

import { useSyncExternalStore } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  formatEther,
  http,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";

/** Testnet unless the build says otherwise, matching the session network. */
export const CHAIN = process.env.NEXT_PUBLIC_SESSION_NETWORK === "testnet" ? bscTestnet : bsc;

const reader = createPublicClient({ chain: CHAIN, transport: http() });

export type WalletState = {
  address: `0x${string}` | null;
  chainId: number | null;
  balance: bigint | null;
};

/**
 * The extension wallet, shared by the nav and the hire panel.
 *
 * Deliberately not React context: the nav and the panel live in different
 * trees, and a module-level store keeps them in step without wrapping the
 * whole app in a provider for one address.
 */
/**
 * One frozen value for "no wallet". useSyncExternalStore compares snapshots by
 * identity, so a fresh object literal here is an infinite render loop.
 */
/**
 * A site cannot make an extension forget it — the permission lives in the
 * wallet, and asking for accounts again just returns them. So "disconnect"
 * has to be remembered here, or restoreWallet hands the account straight
 * back on the next render and the button looks broken.
 */
const DISMISSED = "nebu2.wallet.dismissed";

const DISCONNECTED: WalletState = Object.freeze({ address: null, chainId: null, balance: null });

let state: WalletState = DISCONNECTED;
const listeners = new Set<() => void>();

const emit = (next: WalletState) => {
  state = next;
  for (const listener of listeners) listener();
};

const provider = () => (globalThis as { ethereum?: EIP1193Provider }).ethereum;

async function refresh(address: `0x${string}` | null) {
  if (!address) return emit(DISCONNECTED);
  const injected = provider();
  const wallet = injected
    ? createWalletClient({ chain: CHAIN, transport: custom(injected) })
    : null;
  const [chainId, balance] = await Promise.all([
    wallet?.getChainId().catch(() => null) ?? null,
    reader.getBalance({ address }).catch(() => null),
  ]);
  emit({ address, chainId, balance });
}

export async function connectWallet() {
  try {
    localStorage.removeItem(DISMISSED);
  } catch {
    // Nothing to clear if storage will not answer.
  }
  const injected = provider();
  if (!injected)
    throw new Error("No wallet extension found. Install MetaMask, Rabby or Binance Wallet.");
  const wallet = createWalletClient({ chain: CHAIN, transport: custom(injected) });
  const [address] = await wallet.requestAddresses();
  if (!address) throw new Error("The wallet returned no account.");
  await refresh(address);
  return address;
}

export function disconnectWallet() {
  try {
    localStorage.setItem(DISMISSED, "1");
  } catch {
    // Blocked storage costs the memory, not the disconnect.
  }
  emit(DISCONNECTED);
}

/** Agents only ever build BSC calldata, so a wallet elsewhere has to move. */
export async function switchToChain() {
  const injected = provider();
  if (!injected) return;
  const wallet = createWalletClient({ chain: CHAIN, transport: custom(injected) });
  await wallet.switchChain({ id: CHAIN.id }).catch(() => wallet.addChain({ chain: CHAIN }));
  await refresh(state.address);
}

/** Reconnect silently if the extension still remembers this site. */
export async function restoreWallet() {
  const injected = provider();
  if (!injected || state.address) return;
  // Reconnecting someone who just disconnected is not a restore, it is an
  // argument. Connecting again is what clears this.
  try {
    if (localStorage.getItem(DISMISSED)) return;
  } catch {
    // Unreadable storage means no record of a disconnect, so carry on.
  }
  const [address] = await createWalletClient({ chain: CHAIN, transport: custom(injected) })
    .getAddresses()
    .catch(() => []);
  if (address) await refresh(address);
}

let wired = false;
function wire() {
  const injected = provider();
  if (wired || !injected?.on) return;
  wired = true;
  // The user can change account or network in the extension at any time.
  injected.on("accountsChanged", (accounts) =>
    refresh(((accounts as string[])[0] as `0x${string}` | undefined) ?? null),
  );
  injected.on("chainChanged", () => refresh(state.address));
}

export function useWallet() {
  return useSyncExternalStore(
    (listener) => {
      wire();
      listeners.add(listener);
      void restoreWallet();
      return () => listeners.delete(listener);
    },
    () => state,
    () => DISCONNECTED,
  );
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const formatBnb = (wei: bigint | null) =>
  wei === null ? "—" : `${Number(formatEther(wei)).toFixed(4)} BNB`;
