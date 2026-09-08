"use client";

import { useState } from "react";
import {
  EXPLORER,
  formatBnb,
  fundAgentWallet,
  NETWORK,
  openAgentWallet,
  refreshAgentBalance,
  startFreshAgentWallet,
  useAgentWallet,
} from "@/lib/agent-wallet";
import { connectWallet, short, useWallet } from "@/lib/use-wallet";
import { WalletMark } from "./ui";

const field =
  "w-full bg-transparent border border-white/15 px-[12px] py-[9px] font-manrope text-white text-[13px] leading-[15.6px] outline-none focus:border-[#AFDDFF]/60 transition-colors";
const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";
const primary =
  "bg-[#AFDDFF] px-[16px] py-[11px] font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors";
const ghost =
  "border border-white/30 px-[16px] py-[10px] font-manrope text-white text-[13px] uppercase tracking-wide hover:border-white disabled:opacity-40 transition-colors";

export function AgentWalletPanel() {
  const agent = useAgentWallet();
  const yours = useWallet();
  const [deposit, setDeposit] = useState("0.05");
  const [phase, setPhase] = useState<"idle" | "opening" | "funding" | "fresh">("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = phase !== "idle";

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
        <span className={legend}>The agent's wallet · unlocked by this device</span>

        {agent.address ? (
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
              This is the wallet your agents work from. It holds only what you send it, it is
              unlocked by this device rather than a seed phrase, and every agent you hire draws its
              limits from what is in here.
            </p>
          </>
        ) : (
          <p className="font-manrope text-white text-[13px] leading-[18px] mt-[10px]">
            {agent.known
              ? `This device made an agent wallet, ${short(agent.known)}. Unlock it to carry on.`
              : "Your agents get their own wallet, unlocked by this device the way you unlock your phone. Create it, send it some BNB, and they take over from there."}
          </p>
        )}

        {!agent.address && (
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
        )}
      </div>

      {agent.address && (
        <div
          className="border border-white/15 p-[20px] space-y-[12px] anim-fade-up"
          style={{ animationDelay: "520ms" }}
        >
          <span className={legend}>
            {yours.address ? `Deposit BNB from ${short(yours.address)}` : "Deposit BNB"}
          </span>
          {yours.address ? (
            <div className="flex gap-[10px]">
              <input
                className={field}
                value={deposit}
                inputMode="decimal"
                onChange={(event) => setDeposit(event.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run("funding", async () => {
                    const hash = await fundAgentWallet(deposit);
                    setNote(`Sent · ${hash}`);
                  })
                }
                className={primary}
              >
                {phase === "funding" ? "Sending…" : "Send"}
              </button>
            </div>
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

      <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
        Running against BNB {NETWORK === "mainnet" ? "mainnet" : "testnet"}.
      </p>
    </div>
  );
}
