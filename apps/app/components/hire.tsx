"use client";

import { BNB, BNB_TESTNET, createClient, type PasskeySigner } from "@altananetwork/sdk";
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
import { useCallback, useEffect, useState } from "react";
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
import { agentAuto, agentScope, buildPlan } from "@/lib/agent-api";
import type { AgentMeta } from "@/lib/agents";
import { connectWallet, short as shortAddress, switchToChain, useWallet } from "@/lib/use-wallet";

/** Testnet by default: a grant registers a key on chain and costs a fee. */
const NETWORK: SessionNetwork =
  (process.env.NEXT_PUBLIC_SESSION_NETWORK as SessionNetwork) ?? "testnet";
const CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
const CHAIN = NETWORK === "mainnet" ? bsc : bscTestnet;
const EXPLORER = NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

const reader = createPublicClient({ chain: CHAIN, transport: http(CONFIG.publicRpcUrl) });

type Grant = {
  network: SessionNetwork;
  walletAddress: `0x${string}`;
  stored: SerializedSession;
  sessionKey: `0x${string}`;
  transactionHash?: string;
};

const storageKey = (id: string) => `nebu2.grant.${id}`;
/**
 * One passkey serves every agent, so the wallet it opens is remembered once,
 * not per agent. Remembering it at all is the point: without it there is no
 * way to tell "recovery failed" from "there is nothing to recover", and the
 * panel used to answer both by minting a fresh wallet — which quietly strands
 * whatever the previous one was holding.
 */
const WALLET_KEY = "nebu2.wallet";
const short = (address: string) => `${address.slice(0, 10)}…${address.slice(-8)}`;

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

export function HirePanel({ agent }: { agent: AgentMeta }) {
  const [wallet, setWallet] = useState<{ address: `0x${string}`; signer: PasskeySigner } | null>(
    null,
  );
  /** The agent wallet this device has already made, before any passkey prompt. */
  const [knownAddress, setKnownAddress] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [auto, setAuto] = useState<AutoParams | null>(null);
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [deposit, setDeposit] = useState("0.05");
  const [grant, setGrant] = useState<Grant | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "opening" | "funding" | "granting" | "running" | "revoking"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const connected = useWallet();

  const busy = phase !== "idle";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(agent.id));
      if (raw) setGrant(JSON.parse(raw) as Grant);
      const known = localStorage.getItem(WALLET_KEY);
      if (known?.startsWith("0x")) setKnownAddress(known as `0x${string}`);
    } catch {
      // Blocked storage just means none of this survives a reload.
    }
  }, [agent.id]);

  /** Everything the panel needs once it knows which wallet it is looking at. */
  const inspect = useCallback(
    async (address: `0x${string}`) => {
      const [funds, chosen] = await Promise.all([
        reader.getBalance({ address }).catch(() => null),
        agentAuto(agent.id, address),
      ]);
      setBalance(funds);
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

  /** Cached so hire, run and revoke do not each fire their own passkey prompt. */
  async function openWallet() {
    if (wallet) return wallet;
    const client = createClient({ chains: [CONFIG] });

    // Once a wallet exists, recovery is the only correct answer. Falling back
    // to creating one turns a cancelled passkey prompt into a brand new
    // address, and the BNB in the old one becomes unreachable from here.
    const opened = knownAddress
      ? await client.recoverFromPasskey({ chainId: CONFIG.chainId })
      : await client
          .recoverFromPasskey({ chainId: CONFIG.chainId })
          .catch(() => client.createPasskeyWallet({ name: "nebu" }));

    const next = { address: opened.address, signer: opened.signer };
    setWallet(next);
    setKnownAddress(next.address);
    try {
      localStorage.setItem(WALLET_KEY, next.address);
    } catch {
      // Blocked storage costs the memory, not the wallet.
    }
    await inspect(next.address);
    return next;
  }

  async function connect() {
    setPhase("opening");
    setError(null);
    try {
      await openWallet();
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  /** Top the agent wallet up from whatever extension wallet the user already has. */
  async function fund() {
    const target = wallet ?? (await openWallet().catch(() => null));
    if (!target) return;
    setPhase("funding");
    setError(null);
    setNote(null);
    try {
      // The nav already owns the extension connection; reuse it rather than
      // prompting a second time.
      const account = connected.address ?? (await connectWallet());
      const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
      if (!injected) throw new Error("No extension wallet found to send from.");
      const sender = createWalletClient({ chain: CHAIN, transport: custom(injected) });
      if ((await sender.getChainId()) !== CHAIN.id) await switchToChain();
      const hash = await sender.sendTransaction({
        account,
        to: target.address,
        value: parseEther(deposit || "0"),
      });
      setNote(`[ SENT ] ${hash}`);
      await reader.waitForTransactionReceipt({ hash }).catch(() => null);
      await inspect(target.address);
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function hire() {
    if (!auto || !scope) return;
    setPhase("granting");
    setError(null);
    try {
      const opened = await openWallet();
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

  async function revoke() {
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
              ? "Session expired. Hire it again to keep it working."
              : `Working until ${expiresAt(session).toISOString().slice(0, 10)}, inside your caps.`}
          </p>
          {auto && (
            <p className="font-manrope text-white/50 text-[11px] leading-[15px]">{auto.reason}</p>
          )}
          {grant.transactionHash && (
            <a
              href={`${EXPLORER}/tx/${grant.transactionHash}`}
              className="block font-manrope text-[#AFDDFF] text-[11px] leading-[14px] break-all"
            >
              {grant.transactionHash}
            </a>
          )}
          <div className="flex gap-[8px]">
            <button type="button" disabled={busy || expired} onClick={runNow} className={primary}>
              {phase === "running" ? "Running…" : "Run now"}
            </button>
            <button type="button" disabled={busy} onClick={revoke} className={ghost}>
              {phase === "revoking" ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-[16px] space-y-[16px]">
          {!wallet ? (
            <>
              {/* Asking someone to "create" the wallet they already made is how
                  they end up with two of them. */}
              {knownAddress ? (
                <p className="font-manrope text-white text-[13px] leading-[18px]">
                  This device already has an agent wallet,{" "}
                  <span className="text-[#AFDDFF]">{short(knownAddress)}</span>. Unlock it with your
                  passkey to carry on.
                </p>
              ) : (
                <p className="font-manrope text-white text-[13px] leading-[18px]">
                  Your agent wallet is a passkey on this device. Create it, send it some BNB, and
                  the agent picks its own venue from there.
                </p>
              )}
              <button type="button" disabled={busy} onClick={connect} className={primary}>
                {phase === "opening"
                  ? "Opening…"
                  : knownAddress
                    ? "Unlock agent wallet"
                    : "Create agent wallet"}
              </button>
            </>
          ) : (
            <>
              <div className="border border-white/10 p-[14px]">
                <span className={legend}>Agent wallet · passkey on this device</span>
                <p className="font-manrope text-white text-[13px] leading-[18px] mt-[4px] break-all">
                  {short(wallet.address)}
                </p>
                <p className="font-manrope text-[#AFDDFF] text-[13px] leading-[18px] mt-[6px]">
                  {balance === null ? "—" : `${Number(formatEther(balance)).toFixed(4)} BNB`}
                </p>
              </div>

              <div className="flex gap-[8px] items-end">
                <label className="flex-1">
                  <span className={legend}>
                    Deposit BNB{connected.address ? ` from ${shortAddress(connected.address)}` : ""}
                  </span>
                  <input
                    className={`${field} mt-[5px]`}
                    value={deposit}
                    onChange={(event) => setDeposit(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={fund}
                  className="border border-[#AFDDFF]/60 px-[16px] py-[9px] font-manrope text-[#AFDDFF] text-[13px] uppercase tracking-wide hover:bg-[#AFDDFF] hover:text-black disabled:opacity-40 transition-colors"
                >
                  {phase === "funding" ? "Sending…" : "Send"}
                </button>
              </div>

              {auto ? (
                <>
                  <div className="border-l border-[#AFDDFF]/50 pl-[12px]">
                    <span className={legend}>The agent picked</span>
                    <p className="font-manrope text-white text-[13px] leading-[18px] mt-[4px]">
                      {auto.reason}
                    </p>
                  </div>

                  {scope && scope.spend.length > 0 && (
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
                        <span className={legend}>Expires in days</span>
                        <input
                          className={`${field} mt-[5px]`}
                          value={days}
                          onChange={(event) => setDays(event.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy || !scope}
                    onClick={hire}
                    className={primary}
                  >
                    {phase === "granting" ? "Hiring…" : "Hire agent"}
                  </button>

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
                    It may only call {scope?.calls.length ?? "…"} contracts, only up to these caps,
                    and only until it expires. Revoking takes one transaction.
                  </p>
                </>
              ) : (
                <p className="font-manrope text-white/50 text-[11px] leading-[16px]">
                  {agent.category === "health"
                    ? "This agent guards a loan you already have rather than deploying a deposit. Once this wallet borrows on Aave V3, it picks its own floor and defends it."
                    : "It picks its venue from the live pool screen, and that feed is not answering right now. Try again in a minute."}
                </p>
              )}
            </>
          )}
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
