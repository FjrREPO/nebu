"use client";

import { BNB, BNB_TESTNET, createClient, type PasskeySigner } from "@altananetwork/sdk";
import type { SessionScope } from "@nebu/core";
import {
  expiresAt,
  grantAgentSession,
  isExpired,
  restoreSession,
  revokeAgentSession,
  runWithSession,
  type SerializedSession,
  type SessionNetwork,
} from "@nebu/session";
import { useCallback, useEffect, useState } from "react";
import { agentScope, buildPlan } from "@/app/actions";
import type { AgentMeta } from "@/lib/agents";
import { ACCENT } from "./ui";

/** Testnet by default: a grant registers a key on chain and costs a fee. */
const NETWORK: SessionNetwork =
  (process.env.NEXT_PUBLIC_SESSION_NETWORK as SessionNetwork) ?? "testnet";
const CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
const EXPLORER = NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

type Grant = {
  network: SessionNetwork;
  walletAddress: `0x${string}`;
  stored: SerializedSession;
  sessionKey: `0x${string}`;
  transactionHash?: string;
};

const storageKey = (id: string) => `nebu2.grant.${id}`;

const field =
  "w-full bg-transparent border border-white/15 px-[12px] py-[9px] font-manrope text-white text-[13px] leading-[15.6px] outline-none focus:border-[#AFDDFF]/60 transition-colors";
const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";

export function HirePanel({ agent }: { agent: AgentMeta }) {
  const [params, setParams] = useState<Record<string, string>>({ ...agent.example });
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [grant, setGrant] = useState<Grant | null>(null);
  const [wallet, setWallet] = useState<{ address: `0x${string}`; signer: PasskeySigner } | null>(
    null,
  );
  const [phase, setPhase] = useState<"idle" | "granting" | "running" | "revoking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const busy = phase !== "idle";

  const loadScope = useCallback(
    async (next: Record<string, string>) => {
      const result = await agentScope(agent.id, next);
      if (!result.ok) return null;
      setScope(result.data);
      setLimits((current) =>
        Object.fromEntries(
          result.data.spend.map((entry) => [
            entry.token.toLowerCase(),
            current[entry.token.toLowerCase()] ?? entry.suggested,
          ]),
        ),
      );
      return result.data;
    },
    [agent.id],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(agent.id));
      if (raw) setGrant(JSON.parse(raw) as Grant);
    } catch {
      // Blocked storage just means the grant does not survive a reload.
    }
    loadScope({ ...agent.example });
  }, [agent.id, agent.example, loadScope]);

  /** Cached so grant, run and revoke do not each fire their own passkey prompt. */
  async function openWallet() {
    if (wallet) return wallet;
    const client = createClient({ chains: [CONFIG] });
    const opened = await client
      .recoverFromPasskey({ chainId: CONFIG.chainId })
      .catch(() => client.createPasskeyWallet({ name: "nebu" }));
    const next = { address: opened.address, signer: opened.signer };
    setWallet(next);
    return next;
  }

  const explain = (message: string) =>
    /executing calls|insufficient|funds/i.test(message)
      ? `${message} The agent wallet needs a little BNB — a grant registers a key on chain.`
      : message;

  async function doGrant() {
    setPhase("granting");
    setError(null);
    setNote(null);
    try {
      const current = (await loadScope(params)) ?? scope;
      if (!current) throw new Error("Could not work out what this agent needs");
      const opened = await openWallet();
      const result = await grantAgentSession({
        network: NETWORK,
        wallet: { address: opened.address },
        signer: opened.signer,
        scope: current,
        limits,
        days: Math.max(1, Number(days) || 7),
      });
      const next: Grant = {
        network: NETWORK,
        walletAddress: opened.address,
        stored: result.stored,
        sessionKey: result.sessionKey,
        transactionHash: result.transactionHash,
      };
      try {
        localStorage.setItem(storageKey(agent.id), JSON.stringify(next));
      } catch {
        // Not fatal: the session still works for this page view.
      }
      setGrant(next);
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function runNow() {
    if (!grant) return;
    setPhase("running");
    setError(null);
    setNote(null);
    try {
      const planned = await buildPlan(agent.id, params);
      if (!planned.ok) throw new Error(planned.error);
      if (!planned.data) {
        setNote("[ NOTHING_TO_DO ]");
        return;
      }
      const result = await runWithSession(
        grant.network,
        restoreSession(grant.stored, grant.sessionKey),
        planned.data.txs.map((tx) => ({ ...tx, value: BigInt(tx.value) })),
      );
      setNote(
        result.transactionHash ? `[ SENT ] ${result.transactionHash}` : `[ ${result.status} ]`,
      );
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function doRevoke() {
    if (!grant) return;
    setPhase("revoking");
    setError(null);
    try {
      const opened = await openWallet();
      await revokeAgentSession(
        grant.network,
        { address: grant.walletAddress },
        opened.signer,
        restoreSession(grant.stored, grant.sessionKey),
      );
      localStorage.removeItem(storageKey(agent.id));
      setGrant(null);
      setNote("[ REVOKED ]");
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  const session = grant ? restoreSession(grant.stored, grant.sessionKey) : null;
  const expired = session ? isExpired(session) : false;

  return (
    <div className="border border-white/15 p-[20px]">
      <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">[ HIRE ]</span>

      {grant && session ? (
        <div className="mt-[16px] space-y-[14px]">
          <p className="font-manrope text-white text-[13px] leading-[18px]">
            {expired
              ? "Session expired. Grant a new one to keep it working."
              : `Working until ${expiresAt(session).toISOString().slice(0, 10)}, inside your caps.`}
          </p>
          {grant.transactionHash && (
            <a
              href={`${EXPLORER}/tx/${grant.transactionHash}`}
              className="block font-manrope text-[#AFDDFF] text-[11px] leading-[14px] break-all"
            >
              {grant.transactionHash}
            </a>
          )}
          <div className="flex gap-[8px]">
            <button
              type="button"
              disabled={busy || expired}
              onClick={runNow}
              className="flex-1 bg-[#AFDDFF] px-[16px] py-[10px] font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors"
            >
              {phase === "running" ? "Running…" : "Run now"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={doRevoke}
              className="flex-1 border border-white/30 px-[16px] py-[10px] font-manrope text-white text-[13px] uppercase tracking-wide hover:border-white disabled:opacity-40 transition-colors"
            >
              {phase === "revoking" ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-[16px] space-y-[14px]">
          <div className="space-y-[10px]">
            {agent.paramSchema.map((spec) => (
              <label key={spec.key} className="block">
                <span className={legend}>{spec.label}</span>
                <input
                  className={`${field} mt-[5px]`}
                  value={params[spec.key] ?? ""}
                  placeholder={spec.placeholder}
                  onChange={(event) => setParams({ ...params, [spec.key]: event.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="space-y-[10px] border-t border-white/10 pt-[14px]">
            <span className={legend}>Daily cap</span>
            {scope?.spend.map((entry) => (
              <label key={entry.token} className="block">
                <span className={legend}>{entry.symbol}</span>
                <input
                  className={`${field} mt-[5px]`}
                  value={limits[entry.token.toLowerCase()] ?? ""}
                  onChange={(event) =>
                    setLimits({ ...limits, [entry.token.toLowerCase()]: event.target.value })
                  }
                />
              </label>
            ))}
            <label className="block">
              <span className={legend}>Expires in days</span>
              <input
                className={`${field} mt-[5px]`}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={doGrant}
            className="w-full bg-[#AFDDFF] px-[16px] py-[11px] font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors"
          >
            {phase === "granting" ? "Granting…" : "Grant session"}
          </button>

          <p className="font-manrope text-white/50 text-[11px] leading-[14px]">
            The agent may only call {scope?.calls.length ?? "…"} contracts, only up to these caps,
            and only until it expires. Revoking takes one transaction.
          </p>
        </div>
      )}

      {note && (
        <p
          className="mt-[14px] font-manrope text-[11px] leading-[14px] break-all"
          style={{ color: ACCENT }}
        >
          {note}
        </p>
      )}
      {error && (
        <p className="mt-[14px] font-manrope text-[#ff9d9d] text-[11px] leading-[14px]">{error}</p>
      )}
    </div>
  );
}
