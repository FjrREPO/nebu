/**
 * Pool discovery for the LP agents. GeckoTerminal is the free, key-less source
 * of the two numbers no contract exposes — 24h volume and swap counts — which
 * is what a fee APR is actually made of.
 */
import { cached, fallbackLogo } from "@nebu/core";

const ENDPOINT = "https://api.geckoterminal.com/api/v2/networks/bsc/dexes";
const POOL_ENDPOINT = "https://api.geckoterminal.com/api/v2/networks/bsc/pools";
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
  /** How far the price moved in a day, as a percentage. Null when unreported. */
  change24h: number | null;
  ageDays: number;
  /** The last day of price, comma-joined oldest first, for the row's trend line. */
  spark: string;
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

type GeckoToken = {
  id: string;
  attributes: { address?: string; symbol?: string; image_url?: string };
};
type GeckoPool = {
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string | null;
    reserve_in_usd: string | null;
    pool_created_at: string | null;
    volume_usd: Record<string, string | null>;
    price_change_percentage: Record<string, string | null>;
    transactions: Record<string, { buys: number; sells: number }>;
  };
  relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } } };
};

/**
 * The feed publishes how far the price has moved over six windows, which is
 * the same thing as six past prices once you know the current one. Candles
 * would be smoother, but the OHLCV endpoint is rate-limited far harder than
 * this one and a row that is sometimes blank is worse than one that is coarse.
 */
const WINDOWS = ["h24", "h6", "h1", "m30", "m15", "m5"] as const;

export function trend(priceUsd: number, changes: Record<string, string | null>) {
  if (!(priceUsd > 0)) return "";
  const past = WINDOWS.map((window) => {
    const move = Number(changes[window] ?? Number.NaN);
    return Number.isFinite(move) ? priceUsd / (1 + move / 100) : Number.NaN;
  });
  const points = [...past, priceUsd];
  // Finite is not enough: a reported change past -100% divides by a negative
  // and hands back a negative price, which is not a thing. Nothing here is
  // worth drawing unless every point is a price.
  return points.every((point) => Number.isFinite(point) && point > 0) ? points.join(",") : "";
}

/** The day's move, when the feed reports one. */
function day(changes: Record<string, string | null> | undefined) {
  const move = Number(changes?.h24 ?? Number.NaN);
  return Number.isFinite(move) ? move : null;
}

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
  // A throttled or timed-out page should cost the board its rows, not all of
  // them — and a fetch that throws has to be caught here, or one slow page
  // rejects the whole board and every agent reports nothing to pick from.
  try {
    const response = await fetch(
      `${ENDPOINT}/${dex}/pools?page=${page}&include=base_token,quote_token`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) },
    );
    if (!response.ok) return { pools: [], tokens: [] };
    const body = (await response.json()) as { data: GeckoPool[]; included?: GeckoToken[] };
    return { pools: body.data ?? [], tokens: body.included ?? [] };
  } catch {
    return { pools: [], tokens: [] };
  }
}

let cache: { at: number; rows: PoolRow[] } | undefined;
/** How long to sit on an empty board before asking the feed again. */
const RETRY_MS = 10_000;

export async function livePools(dex = "pancakeswap-v3-bsc"): Promise<PoolRow[]> {
  // An empty board is a failure rather than an answer, so it is worth coming
  // back to much sooner than a good one needs refreshing.
  const ttl = cache?.rows.length ? CACHE_MS : RETRY_MS;
  if (cache && Date.now() - cache.at < ttl) return cache.rows;

  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, index) => fetchPage(dex, index + 1)),
  );
  const logos = new Map<string, TokenBrief>();
  for (const { tokens } of pages) {
    for (const token of tokens) {
      const address = token.attributes.address;
      logos.set(token.id, {
        symbol: token.attributes.symbol ?? "?",
        logo: token.attributes.image_url ?? (address ? (fallbackLogo(address) ?? null) : null),
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
        change24h: day(pool.attributes.price_change_percentage),
        ageDays: created ? (now - Date.parse(created)) / 86_400_000 : 0,
        spark: trend(
          Number(pool.attributes.base_token_price_usd ?? 0),
          pool.attributes.price_change_percentage ?? {},
        ),
      };
    });

  // A refused refresh must not replace a good board with an empty one — the
  // pools have not gone anywhere, the feed just declined to say so. Keeping the
  // old rows under a fresh timestamp also stops every render retrying at once.
  if (!rows.length && cache?.rows.length) {
    cache = { at: Date.now(), rows: cache.rows };
    return cache.rows;
  }

  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * One pool by address, for a position the top-of-the-board screen never sees.
 *
 * The screen is a shortlist; somebody's liquidity can sit in the two hundredth
 * pool on BNB Chain and still be worth pricing. Without this an agent watching
 * one of those has no view at all, which reads as "nothing to say" when the
 * truth is "not on the list I happened to fetch".
 */
export async function poolByAddress(address: string): Promise<PoolRow | null> {
  return cached(`pool-row:${address.toLowerCase()}`, async () => {
    const response = await fetch(
      `${POOL_ENDPOINT}/${address.toLowerCase()}?include=base_token,quote_token`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) },
    );
    // Throwing rather than returning null matters more than it looks: cached()
    // keeps whatever resolves, so a single 429 answered with null would be
    // remembered as "this pool has no data" for the next quarter of an hour.
    // A rejection is dropped from the cache and retried, and the last good row
    // stands in the meantime.
    if (!response.ok) throw new Error(`geckoterminal answered ${response.status}`);
    const body = (await response.json()) as { data?: GeckoPool; included?: GeckoToken[] };
    const pool = body.data;
    if (!pool) throw new Error("geckoterminal returned no pool");

    const brief = (id: string): TokenBrief => {
      const token = (body.included ?? []).find((entry) => entry.id === id);
      const at = token?.attributes;
      return {
        symbol: at?.symbol ?? "?",
        logo: at?.image_url ?? (at?.address ? (fallbackLogo(at.address) ?? null) : null),
      };
    };
    const { pair, feePercent } = parsePair(pool.attributes.name);
    const tvlUsd = Number(pool.attributes.reserve_in_usd ?? 0);
    const volume24hUsd = Number(pool.attributes.volume_usd.h24 ?? 0);
    const hourly = pool.attributes.transactions.h1;
    const created = pool.attributes.pool_created_at;
    return {
      address: pool.attributes.address,
      pair,
      base: brief(pool.relationships.base_token.data.id),
      quote: brief(pool.relationships.quote_token.data.id),
      feePercent,
      tvlUsd,
      volume24hUsd,
      swapsPerHour: hourly ? hourly.buys + hourly.sells : 0,
      feeApr: tvlUsd > 0 ? ((volume24hUsd * feePercent) / 100 / tvlUsd) * 365 : 0,
      change24h: day(pool.attributes.price_change_percentage),
      ageDays: created ? (Date.now() - Date.parse(created)) / 86_400_000 : 0,
      spark: trend(
        Number(pool.attributes.base_token_price_usd ?? 0),
        pool.attributes.price_change_percentage ?? {},
      ),
    };
  }).catch(() => null);
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
