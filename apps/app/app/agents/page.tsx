import { AgentNode } from "@/components/agent-card";
import { Chip, GridLines, Muted } from "@/components/ui";
import { agentCards } from "@/lib/agents";

export const metadata = {
  title: "Agent registry",
  description:
    "Every Nebu agent on BNB Smart Chain with its live headline metric: what it watches, what it would do right now, and what it needs from your wallet.",
  alternates: { canonical: "/agents" },
};
/** Every card is a live read, so a minute of staleness is the most it keeps. */
export const revalidate = 60;

export default async function AgentsPage() {
  const agents = await agentCards();
  const live = agents.filter((agent) => !agent.error).length;
  const acting = agents.filter((agent) => agent.status?.actionable).length;

  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ THE AGENTS ]
          </span>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-[10px]">
            <h1
              className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] anim-fade-up"
              style={{ animationDelay: "400ms" }}
            >
              Deposit BNB. It takes it from there.
            </h1>
            <div
              className="flex items-center gap-[10px] anim-slide-right"
              style={{ animationDelay: "600ms" }}
            >
              <Chip>
                {live} of {agents.length} online
              </Chip>
              <Chip>{acting} want to act</Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px]">
        <div className="grid gap-[16px] md:grid-cols-2 xl:grid-cols-4">
          {agents.map((agent, index) => (
            <AgentNode key={agent.id} agent={agent} index={index} />
          ))}
        </div>

        <Muted className="mt-[24px] max-w-[720px]">
          Each agent already watches the whole market, so hiring one is just a deposit and a
          spending limit — it chooses where to put your money and tells you why. Every number above
          was read live; where a chart is missing, the data source was busy and the card says so
          rather than making one up.
        </Muted>
      </div>
    </div>
  );
}
