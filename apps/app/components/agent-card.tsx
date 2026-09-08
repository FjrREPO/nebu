import Link from "next/link";
import type { AgentCard as AgentCardData } from "@/lib/agents";
import { categoryLabel } from "@/lib/categories";
import { fmt, trendOf } from "@/lib/series";
import { Sparkline } from "./charts";
import { Muted, TokenMarks } from "./ui";

/**
 * An agent as a node in the diagram: a bordered square carrying its glyph,
 * the live reading beside it, and the metric it watches underneath.
 */
export function AgentNode({ agent, index }: { agent: AgentCardData; index: number }) {
  const trend = trendOf(agent.series);
  const glyph = { rebalancing: "[ ]", grid: "###", yield: "/\\/", health: "<+>" }[agent.category];

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group relative flex flex-col border border-white/15 hover:border-[#AFDDFF]/60 transition-colors anim-fade-up"
      style={{ animationDelay: `${300 + index * 120}ms` }}
    >
      <div className="flex items-start gap-[16px] p-[20px]">
        <div className="grid size-[46px] shrink-0 place-items-center border border-white/80">
          <span className="font-manrope text-white text-[13px] leading-none">{glyph ?? "( )"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-manrope text-[#AFDDFF]/80 text-[11px] leading-[14px] tracking-wide">
              {String(index + 1).padStart(2, "0")}. {categoryLabel(agent.category)}
            </span>
            <span className="font-manrope text-[11px] leading-[14px] text-white/50 whitespace-nowrap">
              [ {agent.error ? "OFFLINE" : "LIVE"} ]
            </span>
          </div>
          <p className="font-graphik text-white text-[20px] leading-[1.15] mt-[6px]">
            {agent.name}
          </p>
          {/* "PancakeSwap V3 Rebalancer" does not need "PancakeSwap V3" under it. */}
          {!agent.name.includes(agent.protocol) && (
            <Muted className="mt-[6px]">{agent.protocol}</Muted>
          )}
        </div>
      </div>

      <div className="px-[20px] pb-[8px]">
        <p className="font-manrope text-white text-[13px] leading-[15.6px]">
          {agent.error ?? agent.status?.headline}
        </p>
        <Muted className="mt-[4px] line-clamp-2">{agent.status?.detail}</Muted>
      </div>

      {agent.series && trend ? (
        <div className="mt-auto">
          <div className="flex items-baseline justify-between gap-3 px-[20px] pb-[6px]">
            <span className="flex items-center gap-[8px] font-manrope text-white/50 text-[11px] leading-[14px] uppercase">
              <TokenMarks srcs={agent.series.logos} />
              {agent.series.label}
            </span>
            <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
              {fmt(trend.last, agent.series.unit)}
            </span>
          </div>
          <Sparkline series={agent.series} />
        </div>
      ) : (
        <div className="mt-auto px-[20px] pb-[20px]">
          <Muted>[ NO HISTORY IN WINDOW ]</Muted>
        </div>
      )}
    </Link>
  );
}
