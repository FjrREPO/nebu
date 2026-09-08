/**
 * Historical supply APY per lending market. No contract publishes its own rate
 * history, and archive calls are not available on public endpoints, so this is
 * DefiLlama's free yields index — the same numbers, kept over time.
 */
import type { SeriesPoint } from "./types.ts";

const POOLS_URL = "https://yields.llama.fi/pools";
const CHART_URL = "https://yields.llama.fi/chart";
const CACHE_MS = 30 * 60_000;

type Pool = { pool: string; chain: string; project: string; symbol: string; tvlUsd: number };

let index: Promise<Pool[]> | undefined;

function allPools(): Promise<Pool[]> {
  index ??= fetch(POOLS_URL, { signal: AbortSignal.timeout(20_000) })
    .then(async (response) =>
      response.ok ? ((await response.json()) as { data?: Pool[] }) : { data: [] },
    )
    .then((body) => body.data ?? [])
    .catch(() => []);
  return index;
}

/** The deepest market for one asset on one protocol, on BNB Chain. */
export async function marketId(project: string, symbol: string) {
  const pools = await allPools();
  const matches = pools
    .filter(
      (pool) =>
        pool.chain === "BSC" &&
        pool.project === project &&
        pool.symbol.toUpperCase() === symbol.toUpperCase(),
    )
    .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
  return matches[0]?.pool ?? null;
}

const charts = new Map<string, { at: number; value: Promise<SeriesPoint[]> }>();

/** Daily APY history for one market, oldest first, as a percentage. */
export function apyHistory(poolId: string, days = 30): Promise<SeriesPoint[]> {
  const hit = charts.get(poolId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = fetch(`${CHART_URL}/${poolId}`, { signal: AbortSignal.timeout(20_000) })
    .then(async (response) =>
      response.ok
        ? ((await response.json()) as { data?: { timestamp: string; apy: number | null }[] })
        : { data: [] },
    )
    .then((body) =>
      (body.data ?? [])
        .filter((row) => row.apy !== null)
        .slice(-days)
        .map((row) => ({ t: Math.floor(Date.parse(row.timestamp) / 1000), v: row.apy as number })),
    )
    .catch(() => []);

  charts.set(poolId, { at: Date.now(), value });
  value.catch(() => charts.delete(poolId));
  return value;
}

/** Line up two daily series on their shared days. */
export function alignDaily(a: SeriesPoint[], b: SeriesPoint[]) {
  const day = (t: number) => Math.floor(t / 86_400);
  const byDay = new Map(b.map((point) => [day(point.t), point.v]));
  return a
    .filter((point) => byDay.has(day(point.t)))
    .map((point) => ({ t: point.t, a: point.v, b: byDay.get(day(point.t)) as number }));
}
