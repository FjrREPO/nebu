import { DeskPanel } from "@/components/desk-panel";
import { GridLines, Muted } from "@/components/ui";
import { agentMeta } from "@/lib/agents";

export const metadata = {
  title: "Desk",
  description:
    "Hire more than one agent and they share a wallet. The desk splits it between them by what each expects to earn and how much the thing it holds moves.",
  alternates: { canonical: "/desk" },
};

export default function DeskPage() {
  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ DESK ]
          </span>
          <h1
            className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] mt-[10px] anim-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Agents that share a wallet
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[28px]">
        <Muted className="max-w-[640px]">
          One agent spends what it likes. Two race each other to the same BNB. This is the split —
          who gets how much of the wallet, from what each one expects to earn and how rough the ride
          is.
        </Muted>
        <DeskPanel agents={agentMeta()} />
      </div>
    </div>
  );
}
