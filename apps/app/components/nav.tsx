"use client";

import { Bot, ChevronDown, Copy, LogOut, Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { formatBnb as formatAgentBnb, signOut, useAgentWallet } from "@/lib/agent-wallet";
import { TESTNET, TWIN } from "@/lib/site";
import { CHAIN, connectWallet, formatBnb, short, switchToChain, useWallet } from "@/lib/use-wallet";
import { ChainMark, WalletMark } from "./ui";

const PAGES = [
  { number: "01", label: "AGENTS", href: "/agents" },
  { number: "02", label: "LEADERBOARD", href: "/leaderboard" },
  { number: "03", label: "DESK", href: "/desk" },
  { number: "04", label: "STATUS", href: "/status" },
  // Only the sandbox has coins to give away.
  ...(TESTNET ? [{ number: "05", label: "FAUCET", href: "/faucet" }] : []),
];

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

/** Every chip in the bar is the same box, so the row reads as one row. */
const chipBox =
  "flex h-[30px] items-center gap-[7px] border border-white/15 px-[10px] hover:border-white/40 transition-colors";

const menuItem =
  "flex w-full items-center gap-[10px] px-[14px] py-[11px] font-manrope text-white/80 text-[13px] leading-[15.6px] hover:bg-white/[0.06] hover:text-white transition-colors";

/** The connected chip and what it opens: identity, then the two things you do with it. */
function WalletMenu({ address, balance }: { address: `0x${string}`; balance: bigint | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={chipBox}>
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
                signOut();
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

/**
 * The landing page is full-bleed, every other page sits in a 1280 column. The
 * nav follows whichever it is on: a gutter from the edge at home, and the same
 * inset the content below it uses everywhere else. Both resolve to pixels, so
 * the change between them is something the browser can animate.
 */
const GUTTER = "var(--gut)";
const COLUMN = `max(${GUTTER}, calc((100% - 1280px) / 2 + ${GUTTER}))`;

export function Nav() {
  const home = usePathname() === "/";
  const agentWallet = useAgentWallet();
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
        <div
          className="w-full flex items-center [--gut:20px] md:[--gut:35px] transition-[padding] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ paddingInline: home ? GUTTER : COLUMN }}
        >
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
            {/* The agents' own wallet, one for all of them, always findable. */}
            <Link href="/wallet" title="The wallet your agents work from" className={chipBox}>
              {agentWallet.known ? (
                <WalletMark address={agentWallet.known} size={15} />
              ) : (
                <Bot className="w-[14px] h-[14px] text-white/60" strokeWidth={1.5} />
              )}
              <span className="font-manrope text-white/70 text-[12px] leading-[15px] whitespace-nowrap">
                {agentWallet.address ? formatAgentBnb(agentWallet.balance) : "Agent wallet"}
              </span>
            </Link>

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

            {/* The other build, one click away: the sandbox from the real site
                and the real site from the sandbox. */}
            <Link
              href={TWIN}
              title={
                TESTNET ? "The live site, on BNB mainnet" : "The same app on BNB testnet, free"
              }
              className="flex h-[30px] items-center border border-white/15 px-[10px] font-manrope text-white/70 text-[11px] uppercase tracking-wide hover:border-white/40 hover:text-white transition-colors whitespace-nowrap"
            >
              {TESTNET ? "Mainnet" : "Try testnet"}
            </Link>

            {/* The chain is a logo, not a word — and a wrong one is a button. */}
            {wrongChain ? (
              <button
                type="button"
                onClick={switchToChain}
                title={`Wrong network — switch to ${CHAIN.name}`}
                className="flex size-[30px] items-center justify-center border border-[#ff8a8a]/60 hover:border-[#ff8a8a] transition-colors"
              >
                <ChainMark className="size-[18px] opacity-60" />
              </button>
            ) : (
              <span
                title={CHAIN.name}
                className={`flex h-[30px] items-center justify-center gap-[7px] border border-white/15 ${TESTNET ? "px-[10px]" : "w-[30px]"}`}
              >
                <ChainMark className="size-[18px]" />
                {/* Two deployments, one design: the word is how you tell them apart. */}
                {TESTNET && (
                  <span className="font-manrope text-[#AFDDFF] text-[11px] uppercase tracking-wide">
                    Testnet
                  </span>
                )}
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
            {/* These were plain divs: the menu looked navigable and was not. */}
            {PAGES.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"}`}
                style={{ transitionDelay: menuOpen ? `${150 + index * 75}ms` : "0ms" }}
              >
                <span className="font-manrope text-[#AFDDFF]/80 text-[14px]">{item.number}.</span>
                <span className="font-manrope text-white text-[28px] leading-[1.2] tracking-tight">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>

          <Link
            href="/wallet"
            onClick={() => setMenuOpen(false)}
            className={`mt-auto flex items-center justify-between gap-3 border border-white/15 px-[14px] py-[12px] transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            style={{ transitionDelay: menuOpen ? `${150 + PAGES.length * 75}ms` : "0ms" }}
          >
            <span className="flex items-center gap-[10px]">
              {agentWallet.known ? (
                <WalletMark address={agentWallet.known} size={20} />
              ) : (
                <Bot className="w-[18px] h-[18px] text-white/60" strokeWidth={1.5} />
              )}
              <span className="font-manrope text-white text-[14px]">Agent wallet</span>
            </span>
            <span className="font-manrope text-[#AFDDFF] text-[13px]">
              {agentWallet.address ? formatAgentBnb(agentWallet.balance) : "set up"}
            </span>
          </Link>

          <Link
            href={TWIN}
            onClick={() => setMenuOpen(false)}
            className={`mt-[10px] flex items-center justify-between border border-white/15 px-[14px] py-[12px] transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            style={{ transitionDelay: menuOpen ? `${170 + PAGES.length * 75}ms` : "0ms" }}
          >
            <span className="font-manrope text-white text-[14px]">
              {TESTNET ? "The live site" : "The sandbox"}
            </span>
            <span className="font-manrope text-[#AFDDFF] text-[13px] uppercase tracking-wide">
              {TESTNET ? "Mainnet" : "Testnet"}
            </span>
          </Link>

          {/* The wallet controls were desktop-only, so a phone had no way in. */}
          <div
            className={`border-t border-white/10 pt-[20px] mt-[16px] transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            style={{ transitionDelay: menuOpen ? `${150 + PAGES.length * 75}ms` : "0ms" }}
          >
            {wallet.address ? (
              <div className="flex items-center gap-[10px]">
                <WalletMark address={wallet.address} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="font-manrope text-white text-[15px] leading-[18px]">
                    {short(wallet.address)}
                  </p>
                  <p className="font-manrope text-white/50 text-[12px] leading-[15px]">
                    {formatBnb(wallet.balance)}
                  </p>
                </div>
                <ChainMark className="size-[20px]" />
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    setMenuOpen(false);
                  }}
                  className="font-manrope text-white/50 text-[12px] uppercase tracking-wide hover:text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-[12px]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={connect}
                  className="flex flex-1 items-center justify-center gap-[8px] bg-[#AFDDFF] px-[16px] py-[12px] font-manrope text-black text-[13px] uppercase tracking-wide disabled:opacity-40 transition-colors"
                >
                  <Wallet className="w-[15px] h-[15px]" strokeWidth={1.5} />
                  {busy ? "Connecting…" : "Connect wallet"}
                </button>
                <ChainMark className="size-[22px]" />
              </div>
            )}
            {wrongChain && (
              <button
                type="button"
                onClick={switchToChain}
                className="mt-[12px] w-full border border-[#ff8a8a]/60 px-[16px] py-[10px] font-manrope text-[#ff8a8a] text-[12px] uppercase tracking-wide"
              >
                Switch to {CHAIN.name}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
