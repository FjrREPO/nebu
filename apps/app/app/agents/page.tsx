import { AgentNode } from "@/components/agent-card";
import { Chip, GridLines, Muted } from "@/components/ui";
import { agentCards } from "@/lib/agents";

export const metadata = { title: "REGISTRY // NEBU" };
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
            [ REGISTRY ]
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
                {live}/{agents.length} FEEDS_LIVE
              </Chip>
              <Chip>{acting} NEED_ACTION</Chip>
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
          Each agent picks its own venue from the screen it already runs, so hiring one is a deposit
          and a spend cap. Fee APR is annualised from a day of volume; the pool feed is a free tier
          with a per-minute budget, so a card with no history says so rather than inventing one.
        </Muted>
      </div>
    </div>
  );
}
