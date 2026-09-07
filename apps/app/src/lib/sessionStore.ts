"use client";

import type { SerializedSession, SessionNetwork } from "@nebu/session";

/**
 * Where a granted session lives between page loads. The session key is a
 * secret, but a heavily scoped one: it can only call the contracts in the
 * grant, only up to the caps, and only until it expires. It never leaves this
 * browser — nebu has no server to send it to.
 */
export type StoredGrant = {
  agentId: string;
  network: SessionNetwork;
  walletAddress: `0x${string}`;
  stored: SerializedSession;
  sessionKey: `0x${string}`;
  grantedAt: number;
  transactionHash?: string;
};

const key = (agentId: string) => `nebu.grant.${agentId}`;

export function readGrant(agentId: string): StoredGrant | null {
  try {
    const raw = localStorage.getItem(key(agentId));
    return raw ? (JSON.parse(raw) as StoredGrant) : null;
  } catch {
    return null;
  }
}

export function writeGrant(grant: StoredGrant) {
  try {
    localStorage.setItem(key(grant.agentId), JSON.stringify(grant));
  } catch {
    // Private mode or blocked storage: the grant still works this session.
  }
}

export function clearGrant(agentId: string) {
  try {
    localStorage.removeItem(key(agentId));
  } catch {
    // Nothing to do — the on-chain revoke is what actually matters.
  }
}

export function allGrants(): StoredGrant[] {
  try {
    return Object.keys(localStorage)
      .filter((entry) => entry.startsWith("nebu.grant."))
      .map((entry) => JSON.parse(localStorage.getItem(entry) as string) as StoredGrant);
  } catch {
    return [];
  }
}
