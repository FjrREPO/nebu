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
  EXPLORER,
  formatBnb,
  NETWORK,
  openAgentWallet,
  refreshAgentBalance,
  useAgentWallet,
} from "@/lib/agent-wallet";
import type { AgentMeta } from "@/lib/agents";
import { TESTNET } from "@/lib/site";
import { short } from "@/lib/use-wallet";
import { WalletMark } from "./ui";

type Grant = {
  network: SessionNetwork;
  walletAddress: `0x${string}`;
  stored: SerializedSession;
  sessionKey: `0x${string}`;
  transactionHash?: string;
};

/**
 * A hire belongs to the agent wallet that made it, not to the browser. Two
 * connected wallets on one laptop have two agent wallets, and each has to see
 * its own hires — sharing one key showed the second wallet a session it could
 * not have signed for.
 */
const storageKey = (id: string, agentWallet: `0x${string}`) =>
  `nebu2.grant.${id}.${agentWallet.toLowerCase()}`;
const legacyKey = (id: string) => `nebu2.grant.${id}`;

const CHAIN_OF: Record<SessionNetwork, number> = { mainnet: 56, testnet: 97 };

/**
 * What the agent holds back for gas. Mirrors GAS_RESERVE_WEI in @nebu/core,
 * copied rather than imported so the browser bundle does not drag in the chain
 * client for one number.
 */
const GAS_RESERVE = 3_000_000_000_000_000n; // 0.003 BNB

/** A cap read aloud, not typed into a box: enough figures to mean something. */
const plainCap = (value: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "0";
  return amount.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

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
  /**
   * Against the chain the session is actually on, which is the grant's when
   * there is one. Comparing with the current config instead let a grant made
   * before the app moved to mainnet keep its "testnet" and still pass — the
   * Run button would then send mainnet calldata to a testnet session, which is
   * the very thing this guard exists to stop.
   */
  const sessionChain = CHAIN_OF[grant?.network ?? NETWORK];
  const wrongChain = agent.chainId !== sessionChain;
  /**
   * The sandbox cuts one thing out, and says which.
   *
   * On testnet a hire is real — the key is registered on chain, the caps are
   * enforced by the account contract, revoking is a transaction — while a run
   * is not, because the pools and lending markets the plans name only exist on
   * mainnet. So hiring stays on and Run stays off, rather than the whole panel
   * refusing on a chain mismatch that is the point of the build.
   */
  const sandbox = TESTNET && wrongChain;
  const canHire = !wrongChain || sandbox;
  /**
   * Not "has no BNB" but "has nothing it can act with". Below the gas reserve
   * there is nothing to deploy and nothing to pay for deploying it.
   *
   * Zero spend caps are not the test: a rebalance of a position that already
   * exists needs no token allowance at all, because it remints from the
   * liquidity it just pulled out — reading that as "unfunded" told a ready
   * agent to go and get more BNB.
   */
  const unfunded = wallet.address !== null && (wallet.balance ?? 0n) <= GAS_RESERVE;
  const shortBy = GAS_RESERVE - (wallet.balance ?? 0n);
  /** No allowance needed is a fact worth stating; "up to 0" is not. */
  const noAllowance = scope?.spend.every((entry) => Number(entry.suggested) === 0) ?? false;

  useEffect(() => {
    const owner = wallet.address;
    if (!owner) return setGrant(null);
    try {
      // Hires made before they were scoped move across, once, to whichever
      // agent wallet actually made them.
      const legacy = localStorage.getItem(legacyKey(agent.id));
      if (legacy) {
        localStorage.removeItem(legacyKey(agent.id));
        const from = (JSON.parse(legacy) as Grant).walletAddress;
        if (from) localStorage.setItem(storageKey(agent.id, from), legacy);
      }
      const raw = localStorage.getItem(storageKey(agent.id, owner));
      if (!raw) return setGrant(null);
      const saved = JSON.parse(raw) as Grant;
      // Whatever is in storage was written by some earlier version of this
      // panel, and the shape has already changed twice. Rebuilding it here
      // means a grant that cannot be rebuilt is dropped now, quietly, instead
      // of throwing in the middle of a render and taking the page with it.
      restoreSession(saved.stored, saved.sessionKey);
      setGrant(saved);
    } catch {
      // Unreadable, blocked, or from a shape we no longer speak. Either way
      // there is no session here, which is what the panel shows anyway.
      localStorage.removeItem(storageKey(agent.id, owner));
      setGrant(null);
    }
  }, [agent.id, wallet.address]);

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
        localStorage.setItem(storageKey(agent.id, opened.address), JSON.stringify(next));
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
      localStorage.removeItem(storageKey(agent.id, grant.walletAddress));
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
            {sandbox
              ? "Hired, on testnet. The key, the caps and the expiry are real; running is off, since the contracts it would call are on mainnet."
              : wrongChain
                ? `This session is on BNB ${grant.network}, but the agent works on chain ${agent.chainId}. Revoke it and hire again.`
                : expired
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
                Your agents work from a wallet of their own, one per wallet you connect. Set it up
                and send it some BNB, then any agent here can be hired in two clicks.
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
                </div>

                {scope && scope.spend.length > 0 && !unfunded && (
                  <p className="font-manrope text-white/50 text-[11px] leading-[15px]">
                    {noAllowance
                      ? "No spending allowance needed — it works with the position it holds."
                      : `Up to ${scope.spend
                          .map((entry) => `${plainCap(entry.suggested)} ${entry.symbol}`)
                          .join(" and ")} a day.`}
                  </p>
                )}

                {unfunded && (
                  <Link href="/wallet" className={`${primary} block text-center`}>
                    Add {formatBnb(shortBy)} to hire it
                  </Link>
                )}

                {!unfunded && (
                  <label className="block">
                    <span className={legend}>Stops working after</span>
                    <input
                      className={`${field} mt-[5px]`}
                      value={days}
                      onChange={(event) => setDays(event.target.value)}
                    />
                  </label>
                )}

                {!unfunded && (
                  <button
                    type="button"
                    disabled={busy || !scope || !canHire}
                    onClick={hire}
                    className={primary}
                  >
                    {phase === "granting" ? "Hiring…" : "Hire agent"}
                  </button>
                )}
                {sandbox && (
                  <p className="font-manrope text-white/50 text-[11px] leading-[15px]">
                    Testnet: the hire is real, the work is not. It cannot run until it is hired on
                    mainnet, where the pools are.
                  </p>
                )}
                {wrongChain && !sandbox && (
                  <p className="font-manrope text-[#ff8a8a] text-[11px] leading-[15px]">
                    This agent works on chain {agent.chainId}, and hiring is set to BNB {NETWORK}.
                    Its transactions name contracts that are not there.
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
                  <div className="space-y-[10px]">
                    {scope?.spend.map((entry) => (
                      <label key={entry.token} className="block">
                        <span className={legend}>{entry.symbol} a day</span>
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
                    <pre className="font-manrope text-white/50 text-[11px] leading-[16px] whitespace-pre-wrap break-all">
                      {JSON.stringify(auto.params, null, 2)}
                    </pre>
                  </div>
                )}

                <p className="font-manrope text-white/50 text-[11px] leading-[14px]">
                  {scope?.calls.length ?? "…"} contracts, your caps, until it expires. Revoking
                  takes one transaction.
                </p>
              </>
            ) : (
              <p className="font-manrope text-white/50 text-[11px] leading-[16px]">
                {agent.category === "health"
                  ? "Nothing to defend yet — this wallet has no loan."
                  : "The market data source is busy. Try again in a minute."}
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
