import Link from "next/link";
import { FaucetPanel } from "@/components/faucet-panel";
import { GridLines, Muted } from "@/components/ui";
import { TESTNET, TWIN } from "@/lib/site";

export const metadata = {
  title: "Faucet",
  description:
    "Test BNB for the Nebu sandbox: fund an agent wallet on BNB testnet and run the whole flow — hire, limits, revoke — without spending anything.",
  alternates: { canonical: "/faucet" },
  robots: { index: TESTNET, follow: true },
};

export default function FaucetPage() {
  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ FAUCET ]
          </span>
          <h1
            className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] mt-[10px] anim-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Money that isn't money
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[24px]">
        {TESTNET ? (
          <>
            <Muted className="max-w-[640px]">
              This build runs on BNB testnet, where the coins are free. Fund an agent wallet from a
              faucet and the rest is the real thing: hiring, spending limits, and revoking all
              happen on chain.
            </Muted>
            <FaucetPanel />
          </>
        ) : (
          <Muted className="max-w-[640px]">
            Nothing to give away here — this is the mainnet build, where the BNB is yours. The
            sandbox is at{" "}
            <Link
              href={`${TWIN}/faucet`}
              className="text-[#AFDDFF] hover:text-white transition-colors"
            >
              {TWIN.replace("https://", "")}
            </Link>
            , same app on testnet, free to run as often as you like.
          </Muted>
        )}
      </div>
    </div>
  );
}
