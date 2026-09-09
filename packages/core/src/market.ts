/**
 * Price history for the sparklines. GeckoTerminal is the same free, key-less
 * feed the pool screen uses; here it answers "what has the number the agent
 * watches been doing" rather than "which pools are worth entering".
 */
import { getAddress } from "viem";
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
/**
 * The last value that actually resolved for a key.
 *
 * Without this, a refused refresh threw away the answer we already had: the
 * cache entry was deleted, the caller got nothing, and a card that had been
 * showing a chart for an hour would suddenly read "no history in window" until
 * some later refresh happened to succeed. Candles from ten minutes ago are a
 * better chart than no chart, and the feed refusing us says nothing at all
 * about the market.
 */
const settled = new Map<string, unknown>();

export function cached<T>(key: string, load: () => Promise<T>, ttl = CACHE_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;

  const value = load()
    .then((result) => {
      settled.set(key, result);
      return result;
    })
    .catch((err) => {
      // A failure must not be cached for five minutes, so the next caller retries.
      cache.delete(key);
      if (settled.has(key)) return settled.get(key) as T;
      throw err;
    });

  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * The free tier allows about 30 calls a minute, and the candle endpoint is
 * stricter still — measured, it starts refusing after two requests inside a
 * few seconds. Only the detail charts come through here, a handful per render,
 * so: one request in flight, two seconds apart, retried when the limiter still
 * says no. Slower than parallel, and it actually returns data.
 */
const GAP_MS = 2_100;
/**
 * How long to wait after each 429 before trying again.
 *
 * A build should be patient: the candle endpoint's allowance is small, a whole
 * site's charts queue behind each other, and the last one in line was reliably
 * refused — a card reading "no history" on a site whose entire claim is live
 * data is worth half a minute of waiting.
 *
 * Everything else gets a shorter one. Retries hold the single-flight queue, so
 * a long ladder does not cost one slow call, it costs that ladder times every
 * call behind it — which turned the headless runner into something that looked
 * hung. Two tries is enough to ride out an ordinary refusal now that a refused
 * refresh falls back to the last good value instead of losing it.
 */
const BUILDING = process.env.NEXT_PHASE === "phase-production-build";
const BACKOFF_MS = BUILDING ? [3_000, 8_000, 20_000] : [2_000, 6_000];
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

/**
 * One request to the market feed, queued behind every other one and backed off
 * when it is refused.
 *
 * Exported because the plugins reach for the same feed: anything that fetches
 * it on its own gets throttled next to this queue rather than inside it, which
 * is how a pool lookup ended up 429-ing while the board beside it was fine.
 */
export const marketGet = (path: string) => get(path);

async function get(path: string) {
  return enqueue(async () => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return response.json();
      const wait = response.status === 429 ? BACKOFF_MS[attempt] : undefined;
      if (wait === undefined) {
        // Not worth failing a page over; the chart just does not render.
        throw new Error(`market feed returned ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
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

/**
 * Token icons, many per request. A logo does not change, so this is cached for
 * the life of the process — and asking for eight of them one at a time is the
 * fastest way to meet the feed's per-minute limit.
 */
const logos = new Map<string, string | null>();

/**
 * PancakeSwap hosts an icon for everything it lists, which is most of what
 * trades here and much of what the market feed has no image for. It is keyed
 * by the checksummed address — the lowercase form returns 404 — and a token it
 * has never heard of simply does not load, which at 18px is no worse than the
 * gap it replaces.
 */
export function fallbackLogo(address: string): string | undefined {
  try {
    return `https://tokens.pancakeswap.finance/images/${getAddress(address)}.png`;
  } catch {
    return undefined;
  }
}

export async function tokenLogos(addresses: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(addresses.map((address) => address.toLowerCase()))];
  const missing = wanted.filter((address) => !logos.has(address));

  // The feed takes up to 30 addresses at a time.
  for (let index = 0; index < missing.length; index += 30) {
    const batch = missing.slice(index, index + 30);
    try {
      const body = (await get(`/tokens/multi/${batch.join(",")}`)) as {
        data?: { attributes?: { address?: string; image_url?: string } }[];
      };
      for (const entry of body.data ?? []) {
        const address = entry.attributes?.address?.toLowerCase();
        if (address) logos.set(address, entry.attributes?.image_url ?? null);
      }
    } catch {
      // A throttled logo feed costs an icon, not a page.
    }
    // Remember the misses too, so a token without an icon is not re-fetched.
    for (const address of batch) if (!logos.has(address)) logos.set(address, null);
  }

  const found = new Map<string, string>();
  for (const address of wanted) {
    const url = logos.get(address) ?? fallbackLogo(address);
    if (url) found.set(address, url);
  }
  return found;
}

/** Where a pool lives on PancakeSwap, for a row the reader wants to open. */
export const poolLink = (pool: string) =>
  `https://pancakeswap.finance/liquidity/pool/bsc/${pool.toLowerCase()}`;

/** Where a token lives on PancakeSwap. */
export const tokenLink = (token: string) =>
  `https://pancakeswap.finance/token/bsc/${token.toLowerCase()}`;

/** An address on the explorer, for anything PancakeSwap does not host. */
export const explorerLink = (address: string) => `https://bscscan.com/address/${address}`;

/**
 * A row sparkline carries no axis and no dates, so the values alone are the
 * whole payload — joined into one string because a table row is flat strings.
 */
export const sparkOf = (points: SeriesPoint[]) =>
  points.length > 1 ? points.map((point) => point.v).join(",") : "";
