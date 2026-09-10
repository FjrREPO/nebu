import { bnbUsd, poolSeries, tokenTopPool, WBNB } from "@nebu/core";
import { NextResponse } from "next/server";

export const revalidate = 60;

/**
 * What BNB is worth, now and hour by hour.
 *
 * The portfolio counts in BNB and reads in dollars, and the part of a wallet
 * that is plain BNB needs this to have a line at all — its value in BNB never
 * moves, and its value in dollars is the only story it has.
 */
export async function GET() {
  const [usd, pool] = await Promise.all([bnbUsd(), tokenTopPool(WBNB)]);
  const history = pool ? await poolSeries(pool, 48, WBNB, "usd") : [];
  return NextResponse.json(
    { usd, history },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
