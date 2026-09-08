import { apyHistory, marketId, poolLink, sparkOf, tokenLink, tokenLogos } from "@nebu/core";
import { bestApy, pct, spreadBps, yieldRadar } from "@nebu/plugin-lending";
import { compactUsd, livePools, shortlist } from "@nebu/plugin-pancakeswap";
import { RowSpark } from "@/components/charts";
import { Chip, GridLines, Muted, TokenMarks } from "@/components/ui";

export const metadata = {
  title: "Leaderboard",
  description:
    "Where the agents shop: PancakeSwap V3 pools ranked by fee momentum, and Aave V3 against Venus supply rates on every asset both list.",
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
            [ THE MARKET ]
          </span>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-[10px]">
            <h1
              className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] anim-fade-up"
              style={{ animationDelay: "400ms" }}
            >
              What the agents are picking from
            </h1>
            <div className="flex gap-[10px] anim-slide-right" style={{ animationDelay: "600ms" }}>
              <Chip>{pools.length} markets</Chip>
              <Chip>{radar.length} coins</Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[40px]">
        <section className="anim-fade-up" style={{ animationDelay: "500ms" }}>
          <div className="flex items-end justify-between gap-4 mb-[10px]">
            <h2 className="font-graphik text-white text-[22px] leading-[1.1]">
              Where the trading fees are
            </h2>
            <span className="font-manrope text-white/50 text-[11px] uppercase">
              {Math.min(pools.length, 20)} rows
            </span>
          </div>
          <Muted className="mb-[12px] max-w-[760px]">
            Traders pay a fee on every swap, and it goes to whoever supplied the two coins. These
            are the busiest markets on PancakeSwap worth supplying — at least $250k deposited, $100k
            traded a day, a swap every three minutes, and open for a week or more. "Fee APR" is last
            year's worth of that, estimated from yesterday.
          </Muted>
          <Muted className="mb-[12px] max-w-[760px]">
            A high fee APR is not free money. The busiest of these turn over many times their own
            size in a day, and that much movement costs a supplier more in price drift than the fees
            pay back. The number is what the fees came to, not what you would keep.
          </Muted>
          <div className="border border-white/15 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${head} text-left`}>Market</th>
                  <th className={`${head} text-right`}>Fee APR</th>
                  <th className={`${head} text-right`}>Deposited</th>
                  <th className={`${head} text-right`}>Traded 24h</th>
                  <th className={`${head} text-right`}>Trades/h</th>
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
                The market data source is busy right now. It will fill in on the next refresh.
              </p>
            )}
          </div>
        </section>

        <section className="anim-fade-up" style={{ animationDelay: "650ms" }}>
          <div className="flex items-end justify-between gap-4 mb-[10px]">
            <h2 className="font-graphik text-white text-[22px] leading-[1.1]">
              Where your savings earn more
            </h2>
            <span className="font-manrope text-white/50 text-[11px] uppercase">
              {radar.length} rows
            </span>
          </div>
          <Muted className="mb-[12px] max-w-[760px]">
            Lend out a coin and you earn interest. Aave and Venus are two places to do that, and
            they rarely pay the same — the gap is what the yield agent moves your money across. Both
            rates are worked out from each app's own contracts rather than copied off a dashboard,
            which is why they may differ slightly from what those sites display.
          </Muted>
          <div className="border border-white/15 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${head} text-left`}>Asset</th>
                  <th className={`${head} text-right`}>Best rate</th>
                  <th className={`${head} text-right`}>Aave V3</th>
                  <th className={`${head} text-right`}>Venus</th>
                  <th className={`${head} text-right`}>Gap</th>
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
