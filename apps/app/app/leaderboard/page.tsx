import { apyHistory, marketId, poolLink, sparkOf, tokenLink, tokenLogos } from "@nebu/core";
import { bestApy, pct, spreadBps, yieldRadar } from "@nebu/plugin-lending";
import { compactUsd, livePools, shortlist } from "@nebu/plugin-pancakeswap";
import { RowSpark } from "@/components/charts";
import { Chip, GridLines, Muted, TokenMarks } from "@/components/ui";

export const metadata = {
  title: "Leaderboard",
  description:
    "What the agents are picking from: PancakeSwap V3 pools ranked by fee momentum, and Aave V3 against Venus supply rates on every asset both list.",
  alternates: { canonical: "/leaderboard" },
};
/** Both boards are live reads; a minute of staleness is plenty. */
export const revalidate = 60;

const cell =
  "font-manrope text-[13px] px-[16px] py-[12px] border-b border-white/5 whitespace-nowrap";
const head =
  "font-manrope text-white/50 text-[11px] uppercase tracking-wide font-normal px-[16px] py-[12px] border-b border-white/10";

export default async function LeaderboardPage() {
  const [pools, radar] = await Promise.all([
    livePools()
      .then(shortlist)
      .catch(() => []),
    yieldRadar().catch(() => []),
  ]);

  const board = pools.slice(0, 20);
  const ranked = [...radar].sort((a, b) => (spreadBps(b) ?? -1) - (spreadBps(a) ?? -1));

  // The pools feed already carries a day of price movement per row, so only
  // the lending trend costs a request: DefiLlama's rate history per market.
  const [assetSparks, icons] = await Promise.all([
    Promise.all(
      ranked.map(async (quote) => {
        const better =
          (quote.aaveApy ?? 0) >= (quote.venusApy ?? 0) ? "aave-v3" : "venus-core-pool";
        const id = await marketId(better, quote.symbol);
        return id ? sparkOf(await apyHistory(id)) : "";
      }),
    ),
    tokenLogos(radar.map((quote) => quote.asset)).catch(() => new Map<string, string>()),
  ]);

  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ LEADERBOARD ]
          </span>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-[10px]">
            <h1
              className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] anim-fade-up"
              style={{ animationDelay: "400ms" }}
            >
              What the agents are picking from
            </h1>
            <div className="flex gap-[10px] anim-slide-right" style={{ animationDelay: "600ms" }}>
              <Chip>{pools.length} POOLS</Chip>
              <Chip>{radar.length} ASSETS</Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[40px]">
        <section>
          <div className="flex items-end justify-between gap-4 mb-[10px]">
            <h2 className="font-graphik text-white text-[22px] leading-[1.1]">Fee momentum</h2>
            <span className="font-manrope text-white/50 text-[11px] uppercase">
              {Math.min(pools.length, 20)} rows
            </span>
          </div>
          <Muted className="mb-[12px] max-w-[760px]">
            PancakeSwap V3 pools past the screen's floor — $250k liquidity, $100k daily volume, 20
            swaps an hour, at least a week old — annualised from the last day of fees against
            current liquidity.
          </Muted>
          <div className="border border-white/15 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${head} text-left`}>Pool</th>
                  <th className={`${head} text-right`}>Fee APR</th>
                  <th className={`${head} text-right`}>Liquidity</th>
                  <th className={`${head} text-right`}>Vol 24h</th>
                  <th className={`${head} text-right`}>Swaps/h</th>
                  <th className={`${head} text-right`}>Trend 24h</th>
                </tr>
              </thead>
              <tbody>
                {board.map((pool) => (
                  <tr key={pool.address} className="hover:bg-white/[0.03]">
                    <td className={`${cell} text-white`}>
                      <span className="mr-[10px] inline-flex align-middle">
                        <TokenMarks srcs={[pool.base.logo, pool.quote.logo]} />
                      </span>
                      <a
                        href={poolLink(pool.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[#AFDDFF] transition-colors"
                      >
                        {pool.pair} {pool.feePercent}%
                      </a>
                    </td>
                    <td className={`${cell} text-right text-[#AFDDFF]`}>
                      {(pool.feeApr * 100).toFixed(1)}%
                    </td>
                    <td className={`${cell} text-right text-white/70`}>
                      ${compactUsd(pool.tvlUsd)}
                    </td>
                    <td className={`${cell} text-right text-white/70`}>
                      ${compactUsd(pool.volume24hUsd)}
                    </td>
                    <td className={`${cell} text-right text-white/70`}>
                      {pool.swapsPerHour.toLocaleString("en-US")}
                    </td>
                    <td className="px-[16px] py-[8px] border-b border-white/5 text-right">
                      <RowSpark values={pool.spark} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pools.length === 0 && (
              <p className="font-manrope text-white/50 text-[13px] text-center py-[28px]">
                The pool feed is not answering right now.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4 mb-[10px]">
            <h2 className="font-graphik text-white text-[22px] leading-[1.1]">Lending spreads</h2>
            <span className="font-manrope text-white/50 text-[11px] uppercase">
              {radar.length} rows
            </span>
          </div>
          <Muted className="mb-[12px] max-w-[760px]">
            Live supply APY on both venues for every asset Aave V3 lists on BNB Chain, widest gap
            first. Each rate is compounded from its own protocol's unit — a per-second ray on Aave,
            a per-block rate on Venus — not copied off a dashboard.
          </Muted>
          <div className="border border-white/15 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${head} text-left`}>Asset</th>
                  <th className={`${head} text-right`}>Best</th>
                  <th className={`${head} text-right`}>Aave V3</th>
                  <th className={`${head} text-right`}>Venus</th>
                  <th className={`${head} text-right`}>Spread</th>
                  <th className={`${head} text-right`}>Trend 30d</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((quote, index) => (
                  <tr key={quote.asset} className="hover:bg-white/[0.03]">
                    <td className={`${cell} text-white`}>
                      <span className="mr-[10px] inline-flex align-middle">
                        <TokenMarks srcs={[icons.get(quote.asset.toLowerCase())]} />
                      </span>
                      <a
                        href={tokenLink(quote.asset)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[#AFDDFF] transition-colors"
                      >
                        {quote.symbol}
                      </a>
                    </td>
                    <td className={`${cell} text-right text-[#AFDDFF]`}>{pct(bestApy(quote))}</td>
                    <td className={`${cell} text-right text-white/70`}>{pct(quote.aaveApy)}</td>
                    <td className={`${cell} text-right text-white/70`}>{pct(quote.venusApy)}</td>
                    <td className={`${cell} text-right text-white/70`}>
                      {spreadBps(quote) === null ? "—" : `${spreadBps(quote)} bps`}
                    </td>
                    <td className="px-[16px] py-[8px] border-b border-white/5 text-right">
                      <RowSpark values={assetSparks[index]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
