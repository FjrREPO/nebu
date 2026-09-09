"use client";

import type { AutoParams, SessionScope } from "@nebu/core";
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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { agentAuto, agentScope, buildPlan } from "@/lib/agent-api";
import {
  CONFIG,
  EXPLORER,
  formatBnb,
  NETWORK,
  openAgentWallet,
  refreshAgentBalance,
  useAgentWallet,
} from "@/lib/agent-wallet";
import type { AgentMeta } from "@/lib/agents";
import { short } from "@/lib/use-wallet";
import { WalletMark } from "./ui";

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
const primary =
  "w-full bg-[#AFDDFF] px-[16px] py-[11px] font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors";
const ghost =
  "flex-1 border border-white/30 px-[16px] py-[10px] font-manrope text-white text-[13px] uppercase tracking-wide hover:border-white disabled:opacity-40 transition-colors";

/** The relay's message for an unfunded wallet says nothing useful on its own. */
const explain = (message: string) =>
  /executing calls|insufficient|funds/i.test(message)
    ? `${message} — the agent wallet needs BNB for gas and the key registration.`
    : message;

/**
 * Everything that is specific to hiring *this* agent: what it chose, the caps
 * it may work within, and how long for. The wallet it works from is shared by
 * every agent, so it lives in one place and only appears here as a line.
 */
export function HirePanel({ agent }: { agent: AgentMeta }) {
  const wallet = useAgentWallet();
  const [auto, setAuto] = useState<AutoParams | null>(null);
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [grant, setGrant] = useState<Grant | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [phase, setPhase] = useState<"idle" | "granting" | "running" | "revoking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const busy = phase !== "idle";
  /**
   * An agent's calldata names contracts on one chain; a session is granted on
   * another. Sending mainnet calldata to a testnet session does not fail
   * loudly — a call to an address with no code succeeds — so the panel would
   * report a transaction while nothing happened. Refuse instead.
   */
  const wrongChain = agent.chainId !== CONFIG.chainId;
  // Limits are worked out from what the agent holds, so hiring an empty wallet
  // grants a session capped at zero — it would sit there unable to act.
  const unfunded = wallet.address !== null && (wallet.balance ?? 0n) === 0n;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(agent.id));
      if (raw) setGrant(JSON.parse(raw) as Grant);
    } catch {
      // Blocked storage just means the grant does not survive a reload.
    }
  }, [agent.id]);

  /** What this agent would do with the wallet it has been given. */
  const inspect = useCallback(
    async (address: `0x${string}`) => {
      const chosen = await agentAuto(agent.id, address);
      if (!chosen.ok) return setError(chosen.error);
      setAuto(chosen.data);
      if (!chosen.data) return;

      const derived = await agentScope(agent.id, chosen.data.params);
      if (!derived.ok) return;
      setScope(derived.data);
      setLimits(
        Object.fromEntries(
          derived.data.spend.map((entry) => [entry.token.toLowerCase(), entry.suggested]),
        ),
      );
    },
    [agent.id],
  );

  useEffect(() => {
    if (wallet.address) void inspect(wallet.address);
  }, [wallet.address, inspect]);

  async function hire() {
    if (!auto || !scope) return;
    setPhase("granting");
    setError(null);
    try {
      const opened = await openAgentWallet();
      const result = await grantAgentSession({
        network: NETWORK,
        wallet: { address: opened.address },
        signer: opened.signer,
        scope,
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
      await refreshAgentBalance();
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function runNow() {
    if (!grant || !auto) return;
    setPhase("running");
    setError(null);
    setNote(null);
    try {
      const planned = await buildPlan(agent.id, auto.params);
      if (!planned.ok) throw new Error(planned.error);
      if (!planned.data) {
        setNote("Nothing to do right now.");
        return;
      }
      const result = await runWithSession(
        grant.network,
        restoreSession(grant.stored, grant.sessionKey),
        planned.data.txs.map((tx) => ({ ...tx, value: BigInt(tx.value) })),
      );
      setNote(result.transactionHash ? `Sent · ${result.transactionHash}` : `${result.status}`);
      await refreshAgentBalance();
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function revoke() {
    if (!grant) return;
    setPhase("revoking");
    setError(null);
    try {
      const opened = await openAgentWallet();
      await revokeAgentSession(
        grant.network,
        { address: grant.walletAddress },
        opened.signer,
        restoreSession(grant.stored, grant.sessionKey),
      );
      localStorage.removeItem(storageKey(agent.id));
      setGrant(null);
      setNote("Revoked.");
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  const session = grant ? restoreSession(grant.stored, grant.sessionKey) : null;
  const expired = session ? isExpired(session) : false;

  return (
    <div
      className="border border-white/15 p-[20px] anim-fade-up"
      style={{ animationDelay: "450ms" }}
    >
      <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">[ HIRE ]</span>

      {grant && session ? (
        <div className="mt-[16px] space-y-[14px]">
          <p className="font-manrope text-white text-[13px] leading-[18px]">
            {expired
              ? "Its time is up. Hire it again to keep it working."
              : `Working until ${expiresAt(session).toISOString().slice(0, 10)}, within the limits you set.`}
          </p>
          {auto && (
            <p className="font-manrope text-white/50 text-[11px] leading-[15px]">{auto.reason}</p>
          )}
          {grant.transactionHash && (
            <a
              href={`${EXPLORER}/tx/${grant.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="block font-manrope text-[#AFDDFF] text-[11px] leading-[14px] break-all"
            >
              {grant.transactionHash}
            </a>
          )}
          <div className="flex gap-[8px]">
            <button
              type="button"
              disabled={busy || expired || wrongChain}
              onClick={runNow}
              className={ghost}
            >
              {phase === "running" ? "Running…" : "Run now"}
            </button>
            <button type="button" disabled={busy} onClick={revoke} className={ghost}>
              {phase === "revoking" ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-[16px] space-y-[16px]">
          {/* One wallet serves every agent, so it is set up once, elsewhere. */}
          {wallet.address ? (
            <Link
              href="/wallet"
              className="flex items-center justify-between gap-3 border border-white/10 px-[14px] py-[11px] hover:border-white/30 transition-colors"
            >
              <span className="flex items-center gap-[10px] min-w-0">
                <WalletMark address={wallet.address} size={20} />
                <span className="min-w-0">
                  <span className={`${legend} block`}>Agent wallet</span>
                  <span className="font-manrope text-white text-[13px] leading-[17px]">
                    {short(wallet.address)} · {formatBnb(wallet.balance)}
                  </span>
                </span>
              </span>
              <span className="font-manrope text-white/40 text-[11px] uppercase whitespace-nowrap">
                Manage
              </span>
            </Link>
          ) : (
            <>
              <p className="font-manrope text-white text-[13px] leading-[18px]">
                Your agents work from one wallet, unlocked by this device. Set it up and send it
                some BNB, then any agent here can be hired in two clicks.
              </p>
              <Link href="/wallet" className={`${primary} block text-center`}>
                {wallet.known ? "Unlock the agent wallet" : "Set up the agent wallet"}
              </Link>
            </>
          )}

          {wallet.address &&
            (auto ? (
              <>
                <div className="border-l border-[#AFDDFF]/50 pl-[12px]">
                  <span className={legend}>The agent chose</span>
                  <p className="font-manrope text-white text-[13px] leading-[18px] mt-[4px]">
                    {auto.reason}
                  </p>
                  {/* You send BNB and it holds something else. Say so. */}
                  {scope && scope.spend.length > 0 && (
                    <p className="font-manrope text-white/50 text-[11px] leading-[15px] mt-[6px]">
                      You only ever send BNB. It converts and holds{" "}
                      {scope.spend.map((entry) => entry.symbol).join(" and ")} for you.
                    </p>
                  )}
                  {/* A fee APR is what the fees came to, not what you keep. */}
                  {/fee apr/i.test(auto.reason) && (
                    <p className="font-manrope text-white/50 text-[11px] leading-[15px] mt-[6px]">
                      That rate is what the pool's fees came to, not what you would keep — a busy
                      pool moves enough that price drift can cost more than the fees pay back.
                    </p>
                  )}
                </div>

                {/*
                  Before a deposit every cap is zero, and boxes labelled with
                  tokens you do not hold read as "you need these" — the opposite
                  of the truth, which is that BNB is all you ever send.
                */}
                {unfunded && (
                  <Link href="/wallet" className={`${primary} block text-center`}>
                    Add BNB to hire it
                  </Link>
                )}

                {scope && scope.spend.length > 0 && !unfunded && (
                  <div className="space-y-[10px]">
                    <span className={legend}>Daily cap</span>
                    {scope.spend.map((entry) => (
                      <label key={entry.token} className="block">
                        <span className={legend}>{entry.symbol}</span>
                        <input
                          className={`${field} mt-[5px]`}
                          value={limits[entry.token.toLowerCase()] ?? ""}
                          onChange={(event) =>
                            setLimits({
                              ...limits,
                              [entry.token.toLowerCase()]: event.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                    <label className="block">
                      <span className={legend}>Stops working after</span>
                      <input
                        className={`${field} mt-[5px]`}
                        value={days}
                        onChange={(event) => setDays(event.target.value)}
                      />
                    </label>
                  </div>
                )}

                {!unfunded && (
                  <button
                    type="button"
                    disabled={busy || !scope || wrongChain}
                    onClick={hire}
                    className={primary}
                  >
                    {phase === "granting" ? "Hiring…" : "Hire agent"}
                  </button>
                )}
                {wrongChain && (
                  <p className="font-manrope text-[#ff8a8a] text-[11px] leading-[15px]">
                    This agent works on BNB Smart Chain, and hiring is currently set to BNB testnet.
                    Its transactions name contracts that do not exist there, so it would report
                    success and do nothing. Set NEXT_PUBLIC_SESSION_NETWORK=mainnet to hire it for
                    real.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setAdvanced(!advanced)}
                  className="font-manrope text-white/40 text-[11px] uppercase tracking-wide hover:text-white/70"
                >
                  {advanced ? "Hide" : "Show"} what it chose
                </button>
                {advanced && (
                  <pre className="font-manrope text-white/50 text-[11px] leading-[16px] whitespace-pre-wrap break-all">
                    {JSON.stringify(auto.params, null, 2)}
                  </pre>
                )}

                <p className="font-manrope text-white/50 text-[11px] leading-[14px]">
                  {scope?.calls.length ?? "…"} contracts, your caps, until it expires. Revoking
                  takes one transaction.
                </p>
              </>
            ) : (
              <p className="font-manrope text-white/50 text-[11px] leading-[16px]">
                {agent.category === "health"
                  ? "This agent guards a loan you already have rather than deploying a deposit. Once this wallet borrows on Aave V3, it picks its own floor and defends it."
                  : "It chooses where to put your money from live market data, and that source is busy right now. Try again in a minute."}
              </p>
            ))}
        </div>
      )}

      {note && (
        <p className="mt-[14px] font-manrope text-[#AFDDFF] text-[11px] leading-[14px] break-all">
          {note}
        </p>
      )}
      {error && (
        <p className="mt-[14px] font-manrope text-[#ff9d9d] text-[11px] leading-[14px]">{error}</p>
      )}
    </div>
  );
}
