/**
 * Price history for the sparklines. GeckoTerminal is the same free, key-less
 * feed the pool screen uses; here it answers "what has the number the agent
 * watches been doing" rather than "which pools are worth entering".
 */
import type { SeriesPoint } from "./types.ts";

const BASE = "https://api.geckoterminal.com/api/v2/networks/bsc";
// Hourly candles do not change more than once an hour, and the free tier is
// tight enough that asking again inside that window costs more than it buys.
const CACHE_MS = 15 * 60_000;
/** Which pool prices a token changes on the scale of months, not minutes. */
const POOL_LOOKUP_CACHE_MS = 60 * 60_000;

// Caching the promise, not the value, means four agents rendering at once
// share one request instead of racing to make four.
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>, ttl = CACHE_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  // A failure must not be cached for five minutes.
  value.catch(() => cache.delete(key));
  return value;
}

/**
 * The free tier allows about 30 calls a minute, and a page render wants eight
 * at once. One request in flight, spaced out, with a single retry when the
 * limiter says no — slower than parallel, and it actually returns data.
 */
const GAP_MS = 260;
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const result = await work();
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

async function get(path: string) {
  return enqueue(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return response.json();
      if (response.status !== 429 || attempt === 1) {
        // Not worth failing a page over; the chart just does not render.
        throw new Error(`market feed returned ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  });
}

/**
 * Hourly closes for a pool, oldest first.
 *
 * `priceOf` names the token to quote, in the other token's units — the same
 * thing a V3 tick means. Leave it out and the feed answers in USD, which does
 * not line up with anything read from the pool contract.
 */
export function poolSeries(pool: string, hours = 48, priceOf?: string): Promise<SeriesPoint[]> {
  const denomination = priceOf ? `&currency=token&token=${priceOf.toLowerCase()}` : "";
  return cached(`pool:${pool}:${hours}:${priceOf ?? "usd"}`, async () => {
    const body = (await get(
      `/pools/${pool.toLowerCase()}/ohlcv/hour?limit=${hours}${denomination}`,
    )) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    const rows = body.data?.attributes?.ohlcv_list ?? [];
    // Each row is [timestamp, open, high, low, close, volume], newest first;
    // a chart reads left to right.
    return rows.map((row) => ({ t: row[0], v: row[4] })).reverse();
  }).catch(() => []);
}

/** The deepest pool a token trades in, which is where its price is set. */
export function tokenTopPool(token: string): Promise<string | null> {
  return cached(
    `token:${token}`,
    async () => {
      const body = (await get(`/tokens/${token.toLowerCase()}/pools?page=1`)) as {
        data?: { attributes?: { address?: string; reserve_in_usd?: string } }[];
      };
      const best = (body.data ?? [])
        .map((entry) => entry.attributes)
        .filter((entry) => entry?.address)
        .sort((a, b) => Number(b?.reserve_in_usd ?? 0) - Number(a?.reserve_in_usd ?? 0))[0];
      return best?.address ?? null;
    },
    POOL_LOOKUP_CACHE_MS,
  ).catch(() => null);
}

/** Hourly closes for whatever pool prices this token, oldest first. */
export async function tokenSeries(token: string, hours = 48): Promise<SeriesPoint[]> {
  const pool = await tokenTopPool(token);
  return pool ? poolSeries(pool, hours) : [];
}
