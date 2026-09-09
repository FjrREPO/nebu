"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  EXPLORER,
  formatBnb,
  openAgentWallet,
  refreshAgentBalance,
  useAgentWallet,
} from "@/lib/agent-wallet";
import { connectWallet, useWallet } from "@/lib/use-wallet";
import { ChainMark, WalletMark } from "./ui";

const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";
const primary =
  "block w-full bg-[#AFDDFF] px-[16px] py-[11px] text-center font-manrope text-black text-[13px] uppercase tracking-wide hover:bg-[#c8e8ff] disabled:opacity-40 transition-colors";

/** Below this an agent has nothing to deploy and nothing to pay for deploying. */
const ENOUGH = 3_000_000_000_000_000n;

/** Where the tBNB comes from. The first is the official one; the rest are for when it says no. */
const FAUCETS = [
  { name: "BNB Chain", href: "https://www.bnbchain.org/en/testnet-faucet" },
  { name: "QuickNode", href: "https://faucet.quicknode.com/bnb-smart-chain/bnb-testnet" },
  { name: "thirdweb", href: "https://thirdweb.com/bnb-smart-chain-testnet" },
];

export function FaucetPanel() {
  const agent = useAgentWallet();
  const yours = useWallet();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A faucet pays out in its own time, so the page keeps looking while it is
  // open rather than asking anyone to refresh.
  useEffect(() => {
    if (!agent.address) return;
    const id = setInterval(() => void refreshAgentBalance(), 8_000);
    return () => clearInterval(id);
  }, [agent.address]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  const funded = (agent.balance ?? 0n) > ENOUGH;

  return (
    <div className="space-y-[24px] max-w-[640px]">
      <div
        className="border border-white/15 p-[20px] anim-fade-up"
        style={{ animationDelay: "400ms" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className={legend}>Send the test BNB here</span>
          <ChainMark className="size-[20px]" />
        </div>

        {agent.address ? (
          <>
            <div className="flex items-center gap-[12px] mt-[12px]">
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
                  {agent.balance !== null && !funded && (
                    <span className="text-white/40"> · watching for the drip</span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(agent.address ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="mt-[14px] flex items-center gap-[8px] border border-white/20 px-[12px] py-[7px] font-manrope text-white/70 text-[11px] uppercase tracking-wide hover:border-white/50 hover:text-white transition-colors"
            >
              {copied ? (
                <Check className="w-[13px] h-[13px]" strokeWidth={1.5} />
              ) : (
                <Copy className="w-[13px] h-[13px]" strokeWidth={1.5} />
              )}
              {copied ? "Copied" : "Copy address"}
            </button>
          </>
        ) : (
          <p className="font-manrope text-white text-[13px] leading-[18px] mt-[10px]">
            {yours.address
              ? "Open your agent wallet first — the test BNB goes straight into it, and everything you hire spends from there."
              : "Connect a wallet first. Each wallet gets its own agent wallet, and the test BNB goes into that one."}
          </p>
        )}

        {!yours.address && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(connectWallet)}
            className={`${primary} mt-[16px]`}
          >
            {busy ? "Connecting…" : "Connect your wallet"}
          </button>
        )}
        {yours.address && !agent.address && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(openAgentWallet)}
            className={`${primary} mt-[16px]`}
          >
            {busy ? "Opening…" : agent.known ? "Unlock agent wallet" : "Create agent wallet"}
          </button>
        )}
        {error && (
          <p className="font-manrope text-[#ff9d9d] text-[12px] leading-[17px] mt-[12px]">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-[12px] anim-fade-up" style={{ animationDelay: "520ms" }}>
        <a href={FAUCETS[0].href} target="_blank" rel="noreferrer" className={primary}>
          Open the {FAUCETS[0].name} faucet
        </a>
        <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
          It asks for the address above. If it turns you away, try{" "}
          {FAUCETS.slice(1).map((faucet, index) => (
            <span key={faucet.href}>
              {index > 0 && " or "}
              <a
                href={faucet.href}
                target="_blank"
                rel="noreferrer"
                className="text-[#AFDDFF] hover:text-white transition-colors"
              >
                {faucet.name}
              </a>
            </span>
          ))}
          .
        </p>
      </div>

      {funded && (
        <Link href="/agents" className={`${primary} anim-fade-up`}>
          It arrived — go hire an agent
        </Link>
      )}
    </div>
  );
}
