"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  EXPLORER,
  formatBnb,
  fundAgentWallet,
  NETWORK,
  openAgentWallet,
  recoverAgentWallet,
  refreshAgentBalance,
  startFreshAgentWallet,
  useAgentWallet,
} from "@/lib/agent-wallet";
import { botWatch, TESTNET, TWIN } from "@/lib/site";
import { connectWallet, short, useWallet } from "@/lib/use-wallet";
import { ChainMark, WalletMark } from "./ui";

const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";
const primary =
  "bg-[#AFDDFF] px-[16px] py-[11px] font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors";
const ghost =
  "border border-white/30 px-[16px] py-[10px] font-manrope text-white text-[13px] uppercase tracking-wide hover:border-white disabled:opacity-40 transition-colors";

/** Sending every last wei would leave nothing to pay for sending it. */
const GAS_RESERVE = parseEther("0.002");

const ChainMarkRow = () => (
  <span className="flex items-center gap-[7px]">
    <ChainMark className="size-[16px]" />
    BNB Smart Chain
  </span>
);

export function AgentWalletPanel() {
  const agent = useAgentWallet();
  const yours = useWallet();
  const [deposit, setDeposit] = useState("0.05");
  const [phase, setPhase] = useState<"idle" | "opening" | "funding" | "fresh" | "recovering">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = phase !== "idle";

  let amountWei = 0n;
  try {
    amountWei = deposit ? parseEther(deposit) : 0n;
  } catch {
    // Half-typed numbers are not an error, they are just not a deposit yet.
  }
  const valid = amountWei > 0n && amountWei <= (yours.balance ?? 0n);

  const run = async (next: typeof phase, work: () => Promise<unknown>) => {
    setPhase(next);
    setError(null);
    setNote(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  };

  return (
    <div className="space-y-[24px] max-w-[640px]">
      <div
        className="border border-white/15 p-[20px] anim-fade-up"
        style={{ animationDelay: "400ms" }}
      >
        <span className={legend}>
          The agent's wallet
          {yours.address && (
            // An address is not a word, and upper-casing one turns 0x into 0X.
            <span className="normal-case"> · for {short(yours.address)}</span>
          )}
        </span>

        {!yours.address ? (
          <p className="font-manrope text-white text-[13px] leading-[18px] mt-[10px]">
            Each wallet gets its own agent wallet. Connect yours and we will open the one that
            belongs to it — or make it, if this is the first time.
          </p>
        ) : agent.address ? (
          <>
            <div className="flex items-center gap-[12px] mt-[10px]">
              <WalletMark address={agent.address} size={30} />
              <div className="min-w-0">
                <a
                  href={`${EXPLORER}/address/${agent.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-manrope text-white text-[15px] leading-[20px] break-all hover:text-[#AFDDFF] transition-colors"
                >
                  {agent.address}
                </a>
                <p className="font-manrope text-[#AFDDFF] text-[13px] leading-[18px] mt-[2px]">
                  {formatBnb(agent.balance)}
                </p>
              </div>
            </div>

            <p className="font-manrope text-white/50 text-[11px] leading-[15px] mt-[14px]">
              This is the wallet your agents work from. It belongs to {short(yours.address)}, it
              holds only what you send it, it is unlocked by a passkey rather than a seed phrase,
              and every agent you hire draws its limits from what is in here.
            </p>

            {/* The address goes with the link, so nobody types it into a chat. */}
            <a
              href={botWatch(agent.address)}
              target="_blank"
              rel="noreferrer"
              className="mt-[14px] inline-flex items-center gap-[8px] border border-white/20 px-[12px] py-[7px] font-manrope text-white/70 text-[11px] uppercase tracking-wide hover:border-white/50 hover:text-white transition-colors"
            >
              Watch it in Telegram
            </a>
          </>
        ) : (
          <p className="font-manrope text-white text-[13px] leading-[18px] mt-[10px]">
            {agent.known
              ? `This wallet already has an agent wallet, ${short(agent.known)}. Unlock it to carry on.`
              : "Your agents get their own wallet, unlocked with a passkey the way you unlock your phone. Create it, send it some BNB, and they take over from there."}
          </p>
        )}

        {!yours.address ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("opening", connectWallet)}
            className={`${primary} mt-[16px] w-full`}
          >
            {phase === "opening" ? "Connecting…" : "Connect your wallet"}
          </button>
        ) : (
          !agent.address && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run("opening", openAgentWallet)}
              className={`${primary} mt-[16px] w-full`}
            >
              {phase === "opening"
                ? "Opening…"
                : agent.known
                  ? "Unlock agent wallet"
                  : "Create agent wallet"}
            </button>
          )
        )}

        {yours.address && !agent.address && !agent.known && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("recovering", recoverAgentWallet)}
            className="mt-[10px] font-manrope text-white/40 text-[11px] uppercase tracking-wide hover:text-white/70 transition-colors"
          >
            {phase === "recovering" ? "Looking…" : "Already have one? Recover it"}
          </button>
        )}
      </div>

      {agent.address && (
        <div className="space-y-[16px] anim-fade-up" style={{ animationDelay: "520ms" }}>
          {/* The amount is the point, so it gets the size. */}
          <div className="border border-white/15 p-[20px]">
            <div className="flex items-start justify-between gap-3">
              <span className={legend}>Deposit BNB</span>
              <ChainMark className="size-[20px]" />
            </div>

            <input
              className="mt-[10px] w-full bg-transparent font-graphik text-white text-[42px] leading-[1.05] outline-none placeholder:text-white/25"
              value={deposit}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount of BNB to deposit"
              onChange={(event) => setDeposit(event.target.value.replace(/[^0-9.]/g, ""))}
            />

            <div className="mt-[14px] flex items-center justify-between gap-3">
              <span className="font-manrope text-white/40 text-[12px]">
                {yours.address ? `You hold ${formatBnb(yours.balance)}` : "Wallet not connected"}
              </span>
              <button
                type="button"
                disabled={!yours.balance || yours.balance <= GAS_RESERVE}
                onClick={() =>
                  setDeposit(formatEther((yours.balance ?? 0n) - GAS_RESERVE).slice(0, 12))
                }
                className="border border-white/20 px-[12px] py-[5px] font-manrope text-white/70 text-[11px] uppercase tracking-wide hover:border-white/50 hover:text-white disabled:opacity-30 transition-colors"
              >
                Max
              </button>
            </div>
          </div>

          {/* What the deposit actually changes, before it is made. */}
          <div className="border border-white/15 divide-y divide-white/5">
            {[
              ["Network", <ChainMarkRow key="n" />],
              ["The agent holds now", formatBnb(agent.balance)],
              ["After this deposit", formatBnb((agent.balance ?? 0n) + amountWei)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between gap-3 px-[16px] py-[12px]"
              >
                <span className="font-manrope text-white/50 text-[12px]">{label}</span>
                <span className="font-manrope text-white text-[13px]">{value}</span>
              </div>
            ))}
          </div>

          {yours.address ? (
            <button
              type="button"
              disabled={busy || !valid}
              onClick={() =>
                run("funding", async () => {
                  const hash = await fundAgentWallet(deposit);
                  setNote(`Sent · ${hash}`);
                  setDeposit("");
                })
              }
              className={`${primary} w-full`}
            >
              {phase === "funding" ? "Sending…" : valid ? `Send ${deposit} BNB` : "Enter an amount"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run("opening", connectWallet)}
              className={`${primary} w-full`}
            >
              Connect your wallet to fund it
            </button>
          )}

          <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
            An agent can only be hired once this has a balance — its spending limits are worked out
            from what it holds.
          </p>
        </div>
      )}

      {agent.address && (
        <div className="flex flex-wrap gap-[10px] anim-fade-up" style={{ animationDelay: "640ms" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("idle", () => refreshAgentBalance())}
            className={ghost}
          >
            Refresh balance
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !confirm(
                  "Start a new agent wallet? Anything left in the current one stays there, and this page will no longer reach it.",
                )
              )
                return;
              void run("fresh", startFreshAgentWallet);
            }}
            className={ghost}
          >
            {phase === "fresh" ? "Creating…" : "Start a new one"}
          </button>
        </div>
      )}

      {note && (
        <p className="font-manrope text-[#AFDDFF] text-[12px] leading-[17px] break-all">{note}</p>
      )}
      {error && <p className="font-manrope text-[#ff9d9d] text-[12px] leading-[17px]">{error}</p>}

      {/* The one line that already said which chain, now says where the other one is. */}
      <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
        Running against BNB {NETWORK === "mainnet" ? "mainnet" : "testnet"} ·{" "}
        <a href={TWIN} className="text-[#AFDDFF]/70 hover:text-[#AFDDFF] transition-colors">
          {TESTNET ? "the real one is here" : "try it free on testnet"}
        </a>
      </p>
    </div>
  );
}
