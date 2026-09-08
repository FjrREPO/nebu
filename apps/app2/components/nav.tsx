"use client";

import { Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { chipClass } from "./ui";

function NavItem({ number, label, delay }: { number: string; label: string; delay: number }) {
  return (
    <Link
      href={`/?class=${label.toLowerCase()}`}
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

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

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
              {CATEGORIES.map((item, index) => (
                <NavItem
                  key={item.key}
                  number={item.number}
                  label={item.label}
                  delay={350 + index * 100}
                />
              ))}
            </div>
          </div>

          <div
            className="hidden lg:flex items-center gap-[12px] ml-auto anim-slide-right"
            style={{ animationDelay: "600ms" }}
          >
            <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
            <span className="font-manrope text-white text-[13px] leading-[15.6px]">
              NOT_CONNECTED
            </span>
            <span className="font-manrope text-white text-[13px] leading-[15.6px] ml-[20px]">
              CHAIN:
            </span>
            <span className={chipClass}>BNB_56</span>
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
            {CATEGORIES.map((item, index) => (
              <div
                key={item.key}
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
