import { notFound } from "next/navigation";
import { DetailChart } from "@/components/charts";
import { HirePanel } from "@/components/hire";
import { Nav } from "@/components/nav";
import { Chip, GridLines, Muted } from "@/components/ui";
import { agentDetail, agentMeta, findAgentMeta } from "@/lib/agents";
import { categoryLabel } from "@/lib/categories";

/** The whole page is live reads, so let it go stale for a minute at most. */
export const revalidate = 60;

const GLYPH: Record<string, string> = {
  rebalancing: "[ ]",
  grid: "###",
  yield: "/\\/",
  health: "<+>",
};

export function generateStaticParams() {
  return agentMeta().map((agent) => ({ id: agent.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const agent = findAgentMeta((await params).id);
  return { title: agent ? `${agent.name} // NEBU` : "NEBU // AGENTS" };
}

/** An 18px CDN token mark. next/image would add a proxy hop for nothing. */
function TokenMark({ src, overlap }: { src?: string; overlap?: boolean }) {
  if (!src) return null;
  const style = `size-[18px] rounded-full ${overlap ? "-ml-[6px]" : ""}`;
  // biome-ignore lint/performance/noImgElement: too small to be worth optimising
  return <img src={src} alt="" className={style} />;
}

const ago = (seconds: number) => {
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (delta < 60) return `${delta}s`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  return `${Math.floor(delta / 3600)}h`;
};

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await agentDetail((await params).id);
  if (!detail) notFound();
  const { meta, status, insights, series } = detail;

  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[220px] md:h-[260px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <Nav />
        <div className="absolute bottom-[28px] left-5 md:left-[35px] right-5 md:right-[35px]">
          <div className="flex items-end gap-[18px]">
            <div
              className="grid size-[76px] shrink-0 place-items-center border border-white/80 anim-scale-in"
              style={{ animationDelay: "300ms" }}
            >
              <span className="font-manrope text-white text-[16px]">
                {GLYPH[meta.category] ?? "( )"}
              </span>
            </div>
            <div className="anim-fade-up" style={{ animationDelay: "400ms" }}>
              <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">
                [ {categoryLabel(meta.category)} ]
              </span>
              <h1 className="font-graphik text-white text-[28px] md:text-[44px] leading-[1.05] mt-[8px]">
                {meta.name}
              </h1>
            </div>
            <div className="ml-auto hidden md:flex items-center gap-[10px] pb-[6px]">
              <Chip>{meta.protocol}</Chip>
              <Chip>{status ? "LIVE" : "NO_FEED"}</Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px]">
        <div className="grid gap-[24px] lg:grid-cols-[340px_1fr] items-start">
          <aside
            className="lg:sticky lg:top-[24px] anim-slide-left"
            style={{ animationDelay: "500ms" }}
          >
            <HirePanel agent={meta} />
            <Muted className="mt-[16px]">{meta.summary}</Muted>
          </aside>

          <div className="min-w-0 space-y-[40px]">
            {insights && (
              <div className="grid grid-cols-2 md:grid-cols-4 border border-white/15">
                {insights.stats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className="p-[18px] border-white/10 [&:not(:nth-child(4n))]:md:border-r [&:not(:nth-child(2n))]:border-r md:[&:not(:nth-child(2n))]:border-r-0 anim-fade-up"
                    style={{ animationDelay: `${560 + index * 70}ms` }}
                  >
                    <span className="font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide">
                      {stat.label}
                    </span>
                    <p className="font-graphik text-white text-[22px] leading-[1.1] mt-[8px]">
                      {stat.value}
                    </p>
                    {stat.hint && <Muted className="mt-[4px]">{stat.hint}</Muted>}
                  </div>
                ))}
              </div>
            )}

            {series && (
              <div className="border border-white/15 p-[20px]">
                <DetailChart series={series} />
              </div>
            )}

            {insights?.table && (
              <div>
                <div className="flex items-end justify-between gap-4 mb-[12px]">
                  <h2 className="font-graphik text-white text-[22px] leading-[1.1]">
                    {insights.table.title}
                  </h2>
                  <span className="font-manrope text-white/50 text-[11px] uppercase">
                    {insights.table.rows.length} rows
                  </span>
                </div>
                {insights.table.caption && (
                  <Muted className="mb-[12px]">{insights.table.caption}</Muted>
                )}
                <div className="border border-white/15 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {insights.table.columns.map((column) => (
                          <th
                            key={column.key}
                            className={`font-manrope text-white/50 text-[11px] uppercase tracking-wide font-normal px-[16px] py-[12px] border-b border-white/10 ${column.align === "end" ? "text-right" : "text-left"}`}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insights.table.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-white/[0.03]">
                          {insights.table?.columns.map((column, index) => (
                            <td
                              key={column.key}
                              className={`font-manrope text-[13px] px-[16px] py-[12px] border-b border-white/5 whitespace-nowrap ${column.align === "end" ? "text-right text-white/70" : "text-white"}`}
                            >
                              {index === 0 && (row.logo || row.logoAlt) && (
                                <span className="mr-[10px] inline-flex align-middle">
                                  <TokenMark src={row.logo} />
                                  <TokenMark src={row.logoAlt} overlap />
                                </span>
                              )}
                              {row[column.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {insights.table.rows.length === 0 && (
                    <p className="font-manrope text-white/50 text-[13px] text-center py-[28px]">
                      Nothing matched in the window scanned.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">
                What it may do with your wallet
              </h2>
              <ul className="border border-white/15 divide-y divide-white/5">
                {meta.grants.map((grant) => (
                  <li key={grant} className="flex gap-[12px] px-[20px] py-[14px]">
                    <span className="font-manrope text-[#AFDDFF] text-[13px]">+</span>
                    <span className="font-manrope text-white/80 text-[13px] leading-[18px]">
                      {grant}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {insights?.activity && insights.activity.length > 0 && (
              <div>
                <div className="flex items-end justify-between gap-4 mb-[12px]">
                  <h2 className="font-graphik text-white text-[22px] leading-[1.1]">
                    Recent activity
                  </h2>
                  <span className="font-manrope text-white/50 text-[11px] uppercase">
                    last ~9,000 blocks
                  </span>
                </div>
                <ul className="border border-white/15 divide-y divide-white/5">
                  {insights.activity.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-[12px] px-[20px] py-[12px]"
                    >
                      <span className="font-manrope text-[#AFDDFF]/80 text-[11px] border border-white/15 px-[6px] py-[2px]">
                        {entry.kind}
                      </span>
                      <span className="font-manrope text-white/80 text-[13px] flex-1 min-w-0">
                        {entry.text}
                      </span>
                      <span className="font-manrope text-white/40 text-[11px]">
                        {ago(entry.timestamp)} ago
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
