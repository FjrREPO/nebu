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
import { connectWallet, disconnectWallet, switchToChain } from "./use-wallet";

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

const WALLET_KEY = "nebu2.wallet";
/**
 * Locked, not forgotten. The credential and the address stay exactly where
 * they were — this only says the session is over, so the wallet does not
 * quietly reopen itself on the next page load. Anything else would be a
 * disconnect button that loses people their money.
 */
const LOCKED_KEY = "nebu2.wallet.locked";
type SavedWallet = { address: `0x${string}`; credential?: PasskeyCredential };

function loadSaved(): SavedWallet | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (!raw) return null;
    // The first version of this stored the bare address.
    if (raw.startsWith("0x")) return { address: raw as `0x${string}` };
    const saved = JSON.parse(raw) as SavedWallet;
    return saved.address?.startsWith("0x") ? saved : null;
  } catch {
    return null;
  }
}

function remember(address: `0x${string}`, signer: PasskeySigner) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify({ address, credential: signer.credential }));
  } catch {
    // Blocked storage costs the memory, not the wallet.
  }
}

export async function refreshAgentBalance(address = state.address) {
  if (!address) return;
  const balance = await reader.getBalance({ address }).catch(() => null);
  emit({ ...state, balance });
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  const saved = loadSaved();
  if (!saved) return;
  try {
    // Signed out last time: show that a wallet exists, but do not open it.
    if (localStorage.getItem(LOCKED_KEY)) {
      emit({ known: saved.address, address: null, signer: null, balance: null });
      return;
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

export function useAgentWallet() {
  return useSyncExternalStore(
    (listener) => {
      restore();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => EMPTY,
  );
}

/** The signer, opening the wallet first if this device has one to open. */
export async function openAgentWallet(): Promise<{
  address: `0x${string}`;
  signer: PasskeySigner;
}> {
  if (state.address && state.signer) return { address: state.address, signer: state.signer };

  try {
    localStorage.removeItem(LOCKED_KEY);
  } catch {
    // Nothing to clear if storage will not answer.
  }

  const saved = loadSaved();
  if (saved?.credential) {
    const signer = signerFromPasskey(saved.credential);
    emit({ ...state, known: saved.address, address: saved.address, signer });
    await refreshAgentBalance(saved.address);
    return { address: saved.address, signer };
  }

  const client = createClient({ chains: [CONFIG] });
  // Without a stored credential, ask the OS which passkey and read the wallet
  // off the chain. Falling back to creating one would turn a cancelled prompt
  // into a brand new address, stranding whatever the old one holds.
  const opened = saved
    ? await client.recoverFromPasskey({ chainId: CONFIG.chainId })
    : await client
        .recoverFromPasskey({ chainId: CONFIG.chainId })
        .catch(() => client.createPasskeyWallet({ name: "nebu" }));

  remember(opened.address, opened.signer);
  emit({ known: opened.address, address: opened.address, signer: opened.signer, balance: null });
  await refreshAgentBalance(opened.address);
  return { address: opened.address, signer: opened.signer };
}

/** Deliberately abandon the remembered wallet and make a new one. */
export async function startFreshAgentWallet() {
  const client = createClient({ chains: [CONFIG] });
  const opened = await client.createPasskeyWallet({ name: "nebu" });
  remember(opened.address, opened.signer);
  emit({ known: opened.address, address: opened.address, signer: opened.signer, balance: null });
  await refreshAgentBalance(opened.address);
  return opened;
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
