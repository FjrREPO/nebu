"use client";

import { type Address, createWalletClient, custom, type EIP1193Provider } from "viem";
import { bsc } from "viem/chains";
import type { WireTx } from "./types";

function provider(): EIP1193Provider {
  const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!injected) throw new Error("No wallet found. Install MetaMask, Rabby or the Binance Wallet.");
  return injected;
}

function client() {
  return createWalletClient({ chain: bsc, transport: custom(provider()) });
}

export async function connect(): Promise<Address> {
  const [account] = await client().requestAddresses();
  if (!account) throw new Error("Wallet returned no account");
  return account;
}

export async function currentAccount(): Promise<Address | null> {
  const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!injected) return null;
  const [account] = await createWalletClient({
    chain: bsc,
    transport: custom(injected),
  }).getAddresses();
  return account ?? null;
}

/** Agents only ever build BSC calldata, so a wallet on another chain must move. */
export async function ensureBsc() {
  const wallet = client();
  if ((await wallet.getChainId()) === bsc.id) return;
  try {
    await wallet.switchChain({ id: bsc.id });
  } catch {
    await wallet.addChain({ chain: bsc });
    await wallet.switchChain({ id: bsc.id });
  }
}

/**
 * Sends the plan in order and stops at the first failure — a rebalance that
 * exits a position but never remints is worse than one that never started.
 */
export async function sendPlan(account: Address, txs: WireTx[], onSent?: (hash: string) => void) {
  await ensureBsc();
  const wallet = client();
  const hashes: string[] = [];
  for (const tx of txs) {
    const hash = await wallet.sendTransaction({
      account,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });
    hashes.push(hash);
    onSent?.(hash);
  }
  return hashes;
}
