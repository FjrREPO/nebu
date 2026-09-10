/**
 * Turning "what an agent holds" into "what it is worth", now and lately.
 *
 * Nobody records the account's history — there is no database here, and the
 * chain does not keep a running total of what a wallet was worth. What it does
 * keep is the price of everything, hour by hour. So the history here is today's
 * holding priced backwards: not a record of what you did, but a fair account of
 * what the market did to what you hold.
 */
import { tokenSeries } from "./market.ts";
import { bnbValue, WBNB } from "./router.ts";
import type { AgentHoldings, Holding, SeriesPoint } from "./types.ts";

const isWbnb = (token: string) => token.toLowerCase() === WBNB.toLowerCase();

/** Two days of hourly prices applied to one set of amounts. */
async function history(items: Holding[]): Promise<{ bnb: SeriesPoint[]; usd: SeriesPoint[] }> {
  const held = items.filter((item) => item.amount > 0);
  if (held.length === 0) return { bnb: [], usd: [] };

  const [bnb, ...prices] = await Promise.all([
    tokenSeries(WBNB, 48),
    ...held.map((item) => (isWbnb(item.token) ? Promise.resolve([]) : tokenSeries(item.token, 48))),
  ]);
  if (bnb.length < 2) return { bnb: [], usd: [] };

  const priced = held.map((item, index) => ({
    item,
    at: new Map(prices[index].map((point) => [point.t, point.v])),
  }));

  const inBnb: SeriesPoint[] = [];
  const inUsd: SeriesPoint[] = [];
  for (const point of bnb) {
    let dollars = 0;
    // An hour missing one token's price is an hour we cannot value, and a
    // portfolio drawn with a piece missing is worse than one hour short.
    const complete = priced.every(({ item, at }) => {
      // BNB's own dollar price is the series we are walking.
      const usd = isWbnb(item.token) ? point.v : at.get(point.t);
      if (usd === undefined) return false;
      dollars += item.amount * usd;
      return true;
    });
    if (!complete) continue;
    inUsd.push({ t: point.t, v: dollars });
    inBnb.push({ t: point.t, v: dollars / point.v });
  }
  return { bnb: inBnb, usd: inUsd };
}

/** Price a set of amounts, now and over the last two days. */
export async function holdingsOf(
  items: { token: string; symbol: string; amount: number }[],
): Promise<AgentHoldings> {
  const priced: Holding[] = await Promise.all(
    items.map(async (item) => ({
      ...item,
      bnb: await bnbValue(item.token as `0x${string}`, item.amount),
    })),
  );
  const both = await history(priced);
  return { items: priced, history: both.bnb, usd: both.usd };
}

/** What a set of holdings comes to, or null when a piece of it has no price. */
export function totalBnb(items: Holding[]): number | null {
  let total = 0;
  for (const item of items) {
    if (item.amount > 0 && item.bnb === null) return null;
    total += item.bnb ?? 0;
  }
  return total;
}
