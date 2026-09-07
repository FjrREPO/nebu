import { bestApy, pct, spreadBps, yieldRadar } from "@nebu/plugin-lending";
import { compactUsd, livePools, shortlist } from "@nebu/plugin-pancakeswap";
import { Column, Row, Text } from "@once-ui-system/core";
import { DataTable, SpecLabel } from "@/components";

export const metadata = { title: "Leaderboard · nebu" };
/** Both boards are live reads; a minute of staleness is plenty. */
export const revalidate = 60;

export default async function LeaderboardPage() {
  const [pools, radar] = await Promise.all([
    livePools()
      .then(shortlist)
      .catch(() => []),
    yieldRadar().catch(() => []),
  ]);

  return (
    <Column fillWidth maxWidth="xl" paddingX="l" paddingY="40" gap="32">
      <Column gap="16" maxWidth="m">
        <SpecLabel mark>leaderboard</SpecLabel>
        <Text variant="display-strong-s">What is worth doing right now</Text>
        <Text variant="body-default-l" onBackground="neutral-weak">
          The two boards the agents pick from, ranked. Fee momentum on PancakeSwap V3, and the
          supply-rate spread between Aave V3 and Venus.
        </Text>
      </Column>

      <Row fillWidth borderTop="neutral-alpha-weak" />

      <DataTable
        table={{
          title: "Fee momentum",
          caption:
            "PancakeSwap V3 pools past the agent's floor, annualised from the last 24 hours of fees against current liquidity.",
          columns: [
            { key: "pair", label: "Pool" },
            { key: "apr", label: "Fee APR", align: "end" },
            { key: "tvl", label: "Liquidity", align: "end" },
            { key: "volume", label: "Vol 24h", align: "end" },
            { key: "swaps", label: "Swaps/h", align: "end" },
          ],
          rows: pools.slice(0, 20).map((pool) => ({
            id: pool.address,
            pair: `${pool.pair} ${pool.feePercent}%`,
            logo: pool.base.logo ?? "",
            logoAlt: pool.quote.logo ?? "",
            apr: `${(pool.feeApr * 100).toFixed(1)}%`,
            tvl: `$${compactUsd(pool.tvlUsd)}`,
            volume: `$${compactUsd(pool.volume24hUsd)}`,
            swaps: pool.swapsPerHour.toLocaleString("en-US"),
          })),
        }}
      />

      <DataTable
        table={{
          title: "Lending spreads",
          caption:
            "Live supply APY on both venues for every asset Aave V3 lists on BNB Chain, widest gap first.",
          columns: [
            { key: "asset", label: "Asset" },
            { key: "best", label: "Best", align: "end" },
            { key: "aave", label: "Aave V3", align: "end" },
            { key: "venus", label: "Venus", align: "end" },
            { key: "spread", label: "Spread", align: "end" },
          ],
          rows: [...radar]
            .sort((a, b) => (spreadBps(b) ?? -1) - (spreadBps(a) ?? -1))
            .map((quote) => ({
              id: quote.asset,
              asset: quote.symbol,
              best: pct(bestApy(quote)),
              aave: pct(quote.aaveApy),
              venus: pct(quote.venusApy),
              spread: spreadBps(quote) === null ? "—" : `${spreadBps(quote)} bps`,
            })),
        }}
      />
    </Column>
  );
}
