"use client";

import {
  BNB,
  BNB_TESTNET,
  createClient,
  type PasskeyCredential,
  type PasskeySigner,
  signerFromPasskey,
} from "@altananetwork/sdk";
import type { SessionNetwork } from "@nebu/session";
import { useSyncExternalStore } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  formatEther,
  http,
  parseEther,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import {
  connectWallet,
  disconnectWallet,
  subscribeWallet,
  switchToChain,
  walletAddress,
} from "./use-wallet";

/**
 * The chain sessions are granted on. It has to match the chain the agents
 * plan against — their calldata names BNB Smart Chain contracts, and a call to
 * an address with no code succeeds rather than reverting, so a mismatch spends
 * gas and reports success while doing nothing.
 */
export const NETWORK: SessionNetwork =
  process.env.NEXT_PUBLIC_SESSION_NETWORK === "testnet" ? "testnet" : "mainnet";
export const CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
export const CHAIN = NETWORK === "mainnet" ? bsc : bscTestnet;
export const EXPLORER =
  NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

export const reader = createPublicClient({ chain: CHAIN, transport: http(CONFIG.publicRpcUrl) });

/**
 * One passkey serves every agent, so the wallet it opens is one thing — not
 * one per agent page. This holds it in module state so the nav, the wallet
 * page and each hire panel are all looking at the same wallet rather than
 * four copies that drift apart.
 *
 * What is remembered is the credential, not just the address. recoverFromPasskey
 * finds a wallet by reading the keys it registered in the on-chain KeyStore,
 * and a wallet created but never used has registered none — so the credential
 * the browser handed us at creation is the only route back to a fresh one.
 */
export type AgentWalletState = {
  /** Remembered from a previous visit, before anything is unlocked. */
  known: `0x${string}` | null;
  address: `0x${string}` | null;
  signer: PasskeySigner | null;
  balance: bigint | null;
};

const EMPTY: AgentWalletState = Object.freeze({
  known: null,
  address: null,
  signer: null,
  balance: null,
});

let state: AgentWalletState = EMPTY;
const listeners = new Set<() => void>();

const emit = (next: AgentWalletState) => {
  state = next;
  for (const listener of listeners) listener();
};

/**
 * One agent wallet per connected wallet, not one per browser.
 *
 * Keyed on the address you connect with, because that is whose agent it is:
 * two wallets on one laptop were sharing an agent wallet and its balance,
 * which is nobody's idea of separate accounts. Nothing on chain ties them —
 * the passkey alone controls the agent wallet — so this is about whose money
 * is whose, and about not being able to open an agent you did not fund.
 */
const WALLET_KEY = "nebu2.wallet";
const keyFor = (owner: `0x${string}`) => `${WALLET_KEY}.${owner.toLowerCase()}`;
/**
 * Locked, not forgotten. The credential and the address stay exactly where
 * they were — this only says the session is over, so the wallet does not
 * quietly reopen itself on the next page load. Anything else would be a
 * disconnect button that loses people their money.
 */
const LOCKED_KEY = "nebu2.wallet.locked";
type SavedWallet = { address: `0x${string}`; credential?: PasskeyCredential };

function loadSaved(owner: `0x${string}` | null): SavedWallet | null {
  if (!owner) return null;
  try {
    // Anyone who made an agent wallet before it was scoped keeps it: the first
    // wallet to connect after this adopts the unscoped one rather than being
    // shown a "create" button next to money it already has.
    const legacy = localStorage.getItem(WALLET_KEY);
    if (legacy && !localStorage.getItem(keyFor(owner))) {
      localStorage.setItem(keyFor(owner), legacy);
      localStorage.removeItem(WALLET_KEY);
    }
    const raw = localStorage.getItem(keyFor(owner));
    if (!raw) return null;
    // The first version of this stored the bare address.
    if (raw.startsWith("0x")) return { address: raw as `0x${string}` };
    const saved = JSON.parse(raw) as SavedWallet;
    return saved.address?.startsWith("0x") ? saved : null;
  } catch {
    return null;
  }
}

function remember(owner: `0x${string}`, address: `0x${string}`, signer: PasskeySigner) {
  try {
    localStorage.setItem(keyFor(owner), JSON.stringify({ address, credential: signer.credential }));
  } catch {
    // Blocked storage costs the memory, not the wallet.
  }
}

export async function refreshAgentBalance(address = state.address) {
  if (!address) return;
  const balance = await reader.getBalance({ address }).catch(() => null);
  // Connecting a different wallet while this was in flight would otherwise
  // stamp one agent wallet's balance onto another one's screen — which is the
  // exact confusion scoping these wallets was meant to end.
  if (state.address !== address) return;
  emit({ ...state, balance });
}

/** Which connected wallet the current state belongs to. */
let shownFor: `0x${string}` | null = null;

/**
 * Load whichever agent wallet belongs to the connected address.
 *
 * Called again whenever that address changes, because the answer changes with
 * it: connecting a different wallet has to show a different agent, and
 * disconnecting has to show none rather than leaving the last one on screen.
 */
function restore() {
  const owner = walletAddress();
  if (owner === shownFor) return;
  shownFor = owner;

  const saved = loadSaved(owner);
  if (!saved) return emit(EMPTY);

  try {
    // Signed out last time: show that a wallet exists, but do not open it.
    if (localStorage.getItem(LOCKED_KEY)) {
      return emit({ known: saved.address, address: null, signer: null, balance: null });
    }
  } catch {
    // Unreadable storage means no record of a sign-out, so carry on.
  }
  // Rebuilding from a stored credential asks nothing of the user and nothing
  // of the chain, so the wallet is simply there on load. The biometric prompt
  // arrives later, when something is actually signed.
  const signer = saved.credential ? signerFromPasskey(saved.credential) : null;
  emit({ known: saved.address, address: signer ? saved.address : null, signer, balance: null });
  if (signer) void refreshAgentBalance(saved.address);
}

let watching = false;
export function useAgentWallet() {
  return useSyncExternalStore(
    (listener) => {
      if (!watching) {
        watching = true;
        subscribeWallet(restore);
      }
      restore();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => EMPTY,
  );
}

/** Nothing can be opened until we know whose agent wallet to open. */
export class NoOwner extends Error {
  constructor() {
    super("Connect your wallet first — an agent wallet belongs to the wallet that funds it.");
  }
}

/** Take an opened wallet as this owner's, and stop treating it as signed out. */
function adopt(owner: `0x${string}`, opened: { address: `0x${string}`; signer: PasskeySigner }) {
  try {
    localStorage.removeItem(LOCKED_KEY);
  } catch {
    // Nothing to clear if storage will not answer.
  }
  remember(owner, opened.address, opened.signer);
  shownFor = owner;
  emit({ known: opened.address, address: opened.address, signer: opened.signer, balance: null });
  return refreshAgentBalance(opened.address).then(() => opened);
}

/** The signer, opening the connected wallet’s agent wallet if there is one. */
export async function openAgentWallet(): Promise<{
  address: `0x${string}`;
  signer: PasskeySigner;
}> {
  if (state.address && state.signer) return { address: state.address, signer: state.signer };

  const owner = walletAddress();
  if (!owner) throw new NoOwner();

  const saved = loadSaved(owner);
  if (saved?.credential) {
    try {
      localStorage.removeItem(LOCKED_KEY);
    } catch {
      // Nothing to clear if storage will not answer.
    }
    const signer = signerFromPasskey(saved.credential);
    emit({ ...state, known: saved.address, address: saved.address, signer });
    await refreshAgentBalance(saved.address);
    return { address: saved.address, signer };
  }

  const client = createClient({ chains: [CONFIG] });
  // A wallet we know the address of but hold no credential for is recovered,
  // never recreated: falling back to creating one would turn a cancelled
  // prompt into a brand new address, stranding whatever the old one holds.
  // A wallet we have never seen gets its own, because a different address
  // hiring agents is a different account, not the same one again.
  const opened = saved
    ? await client.recoverFromPasskey({ chainId: CONFIG.chainId })
    : await client.createPasskeyWallet({ name: "nebu" });

  return adopt(owner, opened);
}

/** Point this wallet at an agent wallet some passkey already controls. */
export async function recoverAgentWallet() {
  const owner = walletAddress();
  if (!owner) throw new NoOwner();
  const client = createClient({ chains: [CONFIG] });
  return adopt(owner, await client.recoverFromPasskey({ chainId: CONFIG.chainId }));
}

/** Deliberately abandon the remembered wallet and make a new one. */
export async function startFreshAgentWallet() {
  const owner = walletAddress();
  if (!owner) throw new NoOwner();
  const client = createClient({ chains: [CONFIG] });
  return adopt(owner, await client.createPasskeyWallet({ name: "nebu" }));
}

/** Top the agent wallet up from whatever extension wallet the user already has. */
export async function fundAgentWallet(amountBnb: string) {
  const target = await openAgentWallet();
  // The nav already owns the extension connection; reuse it rather than
  // prompting a second time.
  const account = (await connectWallet().catch(() => null)) ?? null;
  const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!injected || !account) {
    throw new Error("No wallet found to send from — install MetaMask or another browser wallet.");
  }
  const sender = createWalletClient({ chain: CHAIN, transport: custom(injected) });
  if ((await sender.getChainId()) !== CHAIN.id) await switchToChain();
  const hash = await sender.sendTransaction({
    account,
    to: target.address,
    value: parseEther(amountBnb || "0"),
  });
  await reader.waitForTransactionReceipt({ hash }).catch(() => null);
  await refreshAgentBalance(target.address);
  return hash;
}

export const formatBnb = (wei: bigint | null) =>
  wei === null ? "—" : `${Number(formatEther(wei)).toFixed(4)} BNB`;

/**
 * End the session for both wallets at once.
 *
 * They are two halves of one thing — yours funds the agent's — so signing out
 * of one and leaving the other open is a half-finished action. The agent
 * wallet is locked rather than dropped: its address and credential stay put,
 * and unlocking it needs nothing more than the passkey that made it.
 */
export function signOut() {
  try {
    localStorage.setItem(LOCKED_KEY, "1");
  } catch {
    // Blocked storage costs the memory, not the sign-out.
  }
  emit({ known: state.known, address: null, signer: null, balance: null });
  disconnectWallet();
}
