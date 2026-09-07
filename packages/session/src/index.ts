/**
 * Session keys over the Altana SDK.
 *
 * The difference this makes: without a session the agent can only hand you
 * calldata to sign yourself. With one, the wallet's admin key signs once to
 * authorise a scoped, capped, expiring key, and the agent acts on its own
 * inside those limits. The limits are enforced by the account contract, not by
 * us — a call outside the grant reverts at validation.
 */
import {
  BNB,
  BNB_TESTNET,
  createClient,
  createPrivateKeySigner,
  deserializeSession,
  type NetworkConfig,
  type SerializedSession,
  type Session,
  type SessionPermissions,
  type Signer,
  serializeSession,
  signerFromPrivateKey,
  type Wallet,
} from "@altananetwork/sdk";
import type { AgentTx, SessionScope } from "@nebu/core";
import { type Hex, parseUnits } from "viem";

export type SessionNetwork = "mainnet" | "testnet";

export const NETWORKS: Record<SessionNetwork, NetworkConfig> = {
  mainnet: BNB,
  testnet: BNB_TESTNET,
};

export const sessionClient = (network: SessionNetwork) =>
  createClient({ chains: [NETWORKS[network]] });

/** Caps the user chose, in whole tokens, keyed by token address. */
export type SpendLimits = Record<string, string>;

/**
 * Turns an agent's scope plus the user's caps into Altana permissions. A token
 * the user capped at zero is dropped from `spend` entirely rather than granted
 * a zero allowance, so the agent simply cannot move it.
 */
export function toPermissions(scope: SessionScope, limits: SpendLimits): SessionPermissions {
  const spend = scope.spend
    .map((entry) => {
      const raw = limits[entry.token.toLowerCase()] ?? entry.suggested;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return {
        token: entry.token,
        limit: parseUnits(amount.toFixed(entry.decimals), entry.decimals),
        period: "day" as const,
      };
    })
    .filter((entry) => entry !== null);

  return {
    // Every contract the agent touches, and nothing else.
    calls: scope.calls.map((call) => ({ to: call.to })),
    spend,
  };
}

export type GrantOptions = {
  network: SessionNetwork;
  wallet: Wallet;
  signer: Signer;
  scope: SessionScope;
  limits: SpendLimits;
  /** How long the grant stays valid. It expires on its own with no transaction. */
  days: number;
};

export type GrantResult = {
  session: Session;
  stored: SerializedSession;
  sessionKey: Hex;
  transactionHash?: Hex;
};

export async function grantAgentSession(options: GrantOptions): Promise<GrantResult> {
  // Generate the session key here so it can be persisted; a key that only ever
  // existed inside grantSession dies with the process and strands the grant.
  const sessionSigner = createPrivateKeySigner();
  const sessionKey = (sessionSigner as unknown as { _privateKey: Hex })._privateKey;

  const result = await sessionClient(options.network).grantSession({
    wallet: options.wallet,
    signer: options.signer,
    sessionSigner,
    permissions: toPermissions(options.scope, options.limits),
    expiry: Math.floor(Date.now() / 1000) + options.days * 24 * 60 * 60,
  });

  return {
    session: result,
    stored: serializeSession(result),
    sessionKey,
    transactionHash: result.transactionHash,
  };
}

/** Rebuild a signing session from what was stored plus the key kept separately. */
export function restoreSession(stored: SerializedSession, sessionKey: Hex): Session {
  return deserializeSession(stored, signerFromPrivateKey(sessionKey));
}

/** The agent acting on its own: no admin signature, only the session key. */
export async function runWithSession(network: SessionNetwork, session: Session, txs: AgentTx[]) {
  return sessionClient(network).execute({
    session,
    calls: txs.map((tx) => ({ to: tx.to, data: tx.data, value: tx.value ?? 0n })),
  });
}

/** One transaction, effective immediately, and it cannot be undone. */
export async function revokeAgentSession(
  network: SessionNetwork,
  wallet: Wallet,
  signer: Signer,
  session: Session,
) {
  return sessionClient(network).revokeSession({ wallet, signer, session });
}

export const expiresAt = (session: Session) => new Date(session.expiry * 1000);
export const isExpired = (session: Session) => session.expiry * 1000 <= Date.now();

export type { SerializedSession, Session, Signer, Wallet };
export { serializeSession, signerFromPrivateKey };
