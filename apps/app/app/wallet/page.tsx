import { AgentWalletPanel } from "@/components/agent-wallet-panel";
import { GridLines, Muted } from "@/components/ui";

export const metadata = {
  title: "Agent wallet",
  description:
    "The wallet your Nebu agents work from: one per wallet you connect, unlocked by a passkey rather than a seed phrase, and holding only what you send it.",
  alternates: { canonical: "/wallet" },
};

export default function WalletPage() {
  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ AGENT WALLET ]
          </span>
          <h1
            className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] mt-[10px] anim-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Where your agents keep their money
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[24px]">
        <Muted className="max-w-[640px]">
          One wallet serves every agent you hire. You fund it, the agents work from it, and you can
          empty it or walk away at any time — nothing here can reach the wallet you funded it from.
        </Muted>
        <AgentWalletPanel />
      </div>
    </div>
  );
}
