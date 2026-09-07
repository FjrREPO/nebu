/**
 * Pool discovery for the LP agents. GeckoTerminal is the free, key-less source
 * of the two numbers no contract exposes — 24h volume and swap counts — which
 * is what a fee APR is actually made of.
 */
const ENDPOINT = "https://api.geckoterminal.com/api/v2/networks/bsc/dexes";
const CACHE_MS = 60_000;
const PAGES = 3;

export type TokenBrief = { symbol: string; logo: string | null };

export type PoolRow = {
  address: string;
  pair: string;
  base: TokenBrief;
  quote: TokenBrief;
  /** Fee tier as a percentage, e.g. 0.05 for a 0.05% pool. */
  feePercent: number;
  tvlUsd: number;
  volume24hUsd: number;
  swapsPerHour: number;
  /** Fees the pool paid out over 24h, annualised against its TVL. */
  feeApr: number;
  ageDays: number;
};

/** The bar a pool has to clear before an agent will put liquidity in it. */
export const POOL_FILTER = {
  minTvlUsd: 250_000,
  minVolume24hUsd: 100_000,
  minSwapsPerHour: 20,
  minAgeDays: 7,
  /** Above this the TVL reading is stale or the pool is a trap, not an opportunity. */
  maxFeeApr: 5,
};

type GeckoToken = { id: string; attributes: { symbol?: string; image_url?: string } };
type GeckoPool = {
  attributes: {
    address: string;
    name: string;
    reserve_in_usd: string | null;
    pool_created_at: string | null;
    volume_usd: Record<string, string | null>;
    transactions: Record<string, { buys: number; sells: number }>;
  };
  relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } } };
};

/** The fee tier only shows up in the pool's display name: "USDT / WBNB 0.05%". */
function parsePair(name: string) {
  const match = name.match(/^(.*?)\s*\/\s*(.*?)\s+([\d.]+)%$/);
  if (!match) return { pair: name, feePercent: 0 };
  return { pair: `${match[1]}/${match[2]}`, feePercent: Number(match[3]) };
}

async function fetchPage(
  dex: string,
  page: number,
): Promise<{ pools: GeckoPool[]; tokens: GeckoToken[] }> {
  const response = await fetch(
    `${ENDPOINT}/${dex}/pools?page=${page}&include=base_token,quote_token`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) },
  );
  if (!response.ok) throw new Error(`pool feed returned ${response.status}`);
  const body = (await response.json()) as { data: GeckoPool[]; included?: GeckoToken[] };
  return { pools: body.data ?? [], tokens: body.included ?? [] };
}

let cache: { at: number; rows: PoolRow[] } | undefined;

export async function livePools(dex = "pancakeswap-v3-bsc"): Promise<PoolRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, index) => fetchPage(dex, index + 1)),
  );
  const logos = new Map<string, TokenBrief>();
  for (const { tokens } of pages) {
    for (const token of tokens) {
      logos.set(token.id, {
        symbol: token.attributes.symbol ?? "?",
        logo: token.attributes.image_url ?? null,
      });
    }
  }

  const now = Date.now();
  const rows = pages
    .flatMap(({ pools }) => pools)
    .map((pool): PoolRow => {
      const { pair, feePercent } = parsePair(pool.attributes.name);
      const tvlUsd = Number(pool.attributes.reserve_in_usd ?? 0);
      const volume24hUsd = Number(pool.attributes.volume_usd.h24 ?? 0);
      const hourly = pool.attributes.transactions.h1;
      const created = pool.attributes.pool_created_at;
      const unknown: TokenBrief = { symbol: "?", logo: null };
      return {
        address: pool.attributes.address,
        pair,
        base: logos.get(pool.relationships.base_token.data.id) ?? unknown,
        quote: logos.get(pool.relationships.quote_token.data.id) ?? unknown,
        feePercent,
        tvlUsd,
        volume24hUsd,
        swapsPerHour: hourly ? hourly.buys + hourly.sells : 0,
        feeApr: tvlUsd > 0 ? ((volume24hUsd * feePercent) / 100 / tvlUsd) * 365 : 0,
        ageDays: created ? (now - Date.parse(created)) / 86_400_000 : 0,
      };
    });

  cache = { at: Date.now(), rows };
  return rows;
}

/** Pools the agent would actually work, best fee momentum first. */
export function shortlist(pools: PoolRow[]) {
  return pools
    .filter(
      (pool) =>
        pool.tvlUsd >= POOL_FILTER.minTvlUsd &&
        pool.volume24hUsd >= POOL_FILTER.minVolume24hUsd &&
        pool.swapsPerHour >= POOL_FILTER.minSwapsPerHour &&
        pool.ageDays >= POOL_FILTER.minAgeDays &&
        pool.feeApr > 0 &&
        pool.feeApr <= POOL_FILTER.maxFeeApr,
    )
    .sort((a, b) => b.feeApr - a.feeApr);
}

export const compactUsd = (value: number) =>
  value >= 1_000_000_000
    ? `${(value / 1_000_000_000).toFixed(1)}B`
    : value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
        ? `${(value / 1_000).toFixed(1)}K`
        : value.toFixed(0);
