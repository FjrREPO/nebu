"use client";

import { ChevronDown, Copy, LogOut, Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  CHAIN,
  connectWallet,
  disconnectWallet,
  formatBnb,
  short,
  switchToChain,
  useWallet,
} from "@/lib/use-wallet";
import { ChainMark, WalletMark } from "./ui";

const PAGES = [
  { number: "01", label: "AGENTS", href: "/agents" },
  { number: "02", label: "LEADERBOARD", href: "/leaderboard" },
  { number: "03", label: "STATUS", href: "/status" },
] as const;

function NavItem({
  number,
  label,
  href,
  delay,
}: {
  number: string;
  label: string;
  href: string;
  delay: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-[3px] anim-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">{number}.</span>
      <span className="font-manrope text-white text-[13px] leading-[15.6px] hover:text-[#AFDDFF] transition-colors">
        {label}
      </span>
    </Link>
  );
}

const menuItem =
  "flex w-full items-center gap-[10px] px-[14px] py-[11px] font-manrope text-white/80 text-[13px] leading-[15.6px] hover:bg-white/[0.06] hover:text-white transition-colors";

/** The connected chip and what it opens: identity, then the two things you do with it. */
function WalletMenu({ address, balance }: { address: `0x${string}`; balance: bigint | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-[8px] border border-white/20 px-[10px] py-[5px] hover:border-white/50 transition-colors"
      >
        <WalletMark address={address} />
        <span className="font-manrope text-white text-[13px] leading-[15.6px]">
          {short(address)}
        </span>
        <ChevronDown
          className={`w-[13px] h-[13px] text-white/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <>
          {/* Anywhere else on the page closes it, the way every wallet menu does. */}
          <button
            type="button"
            aria-label="Close wallet menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[236px] border border-white/20 bg-black anim-fade-up">
            <div className="flex items-center gap-[10px] border-b border-white/10 px-[14px] py-[12px]">
              <WalletMark address={address} size={26} />
              <div>
                <p className="font-manrope text-white text-[13px] leading-[15.6px]">
                  {short(address)}
                </p>
                <p className="font-manrope text-white/50 text-[11px] leading-[14px]">
                  {formatBnb(balance)}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={menuItem}
              onClick={() => {
                navigator.clipboard?.writeText(address).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1_400);
              }}
            >
              <Copy className="w-[14px] h-[14px]" strokeWidth={1.5} />
              {copied ? "Copied" : "Copy address"}
            </button>
            <button
              type="button"
              className={menuItem}
              onClick={() => {
                disconnectWallet();
                setOpen(false);
              }}
            >
              <LogOut className="w-[14px] h-[14px]" strokeWidth={1.5} />
              Disconnect wallet
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrongChain = wallet.address !== null && wallet.chainId !== CHAIN.id;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await connectWallet();
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav className="absolute top-0 left-0 z-20 w-full py-5 md:py-[27px]">
        <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] flex items-center">
          <div className="flex items-center gap-[40px]">
            <Link
              href="/"
              className="font-graphik text-white text-[18px] md:text-[21px] leading-[21px] whitespace-nowrap anim-fade-up"
              style={{ animationDelay: "200ms" }}
            >
              {"NEBU // AGENTS"}
            </Link>
            <div className="hidden lg:flex items-center gap-[40px]">
              {PAGES.map((item, index) => (
                <NavItem key={item.href} {...item} delay={350 + index * 100} />
              ))}
            </div>
          </div>

          <div
            className="hidden lg:flex items-center gap-[12px] ml-auto anim-slide-right"
            style={{ animationDelay: "600ms" }}
          >
            {wallet.address ? (
              <WalletMenu address={wallet.address} balance={wallet.balance} />
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={connect}
                className="flex items-center gap-[8px] font-manrope text-white text-[13px] leading-[15.6px] hover:text-[#AFDDFF] disabled:opacity-50 transition-colors"
              >
                <Wallet className="w-[15px] h-[15px]" strokeWidth={1.5} />
                {busy ? "CONNECTING…" : "CONNECT_WALLET"}
              </button>
            )}

            {/* The chain is a logo, not a word — and a wrong one is a button. */}
            {wrongChain ? (
              <button
                type="button"
                onClick={switchToChain}
                title={`Wrong network — switch to ${CHAIN.name}`}
                className="grid size-[26px] place-items-center rounded-full ring-1 ring-[#ff8a8a] hover:ring-white transition-colors"
              >
                <ChainMark className="size-[18px] opacity-60" />
              </button>
            ) : (
              <span title={CHAIN.name} className="grid size-[26px] place-items-center">
                <ChainMark className="size-[18px]" />
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden ml-auto relative w-[40px] h-[40px] flex items-center justify-center anim-fade-in"
            style={{ animationDelay: "400ms" }}
          >
            <span
              className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
            >
              <Menu className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </span>
            <span
              className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`}
            >
              <X className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </span>
          </button>
        </div>
      </nav>

      {error && (
        <p className="absolute top-[64px] right-[35px] z-20 font-manrope text-[#ff9d9d] text-[11px]">
          {error}
        </p>
      )}

      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "visible" : "invisible"}`}
      >
        <button
          type="button"
          aria-label="Close overlay"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity duration-500 ${menuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`relative h-full flex flex-col px-5 pt-24 pb-10 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
        >
          <div className="flex flex-col gap-8">
            {PAGES.map((item, index) => (
              <div
                key={item.href}
                className={`transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"}`}
                style={{ transitionDelay: menuOpen ? `${150 + index * 75}ms` : "0ms" }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-manrope text-[#AFDDFF]/80 text-[14px]">{item.number}.</span>
                  <span className="font-manrope text-white text-[28px] leading-[1.2] tracking-tight">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
