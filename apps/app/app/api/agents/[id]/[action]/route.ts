import { InvalidParams } from "@nebu/core";
import { findPlugin } from "@nebu/plugins";
import { type NextRequest, NextResponse } from "next/server";

export const revalidate = 60;

const CORS = { "access-control-allow-origin": "*" };
/**
 * A minute, which is what every page here already shows.
 *
 * Without a cache header the browser re-runs the whole registry on every visit,
 * and the desk asks eight of these at once — so a second look at the same page
 * cost as much as the first. A plan is the exception: it is the transaction
 * somebody is about to sign, and it is built for that moment.
 */
const FRESH_FOR = "public, s-maxage=60, stale-while-revalidate=300";
const json = (body: unknown, status = 200, cache = FRESH_FOR) =>
  NextResponse.json(body, { status, headers: { ...CORS, "cache-control": cache } });

const ACTIONS = ["status", "auto", "insights", "scope", "plan", "outlook"] as const;
type Action = (typeof ACTIONS)[number];

const isAddress = (value: string | null): value is `0x${string}` =>
  value !== null && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * The same calls the marketplace makes, over HTTP, so an agent runner or
 * another team's tooling can use this registry without importing it — and so
 * the marketplace itself has a stable address to call rather than an id that
 * only exists until the next deploy.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await context.params;
  if (!ACTIONS.includes(action as Action)) {
    return json(
      { error: `unknown action, expected one of ${ACTIONS.join(", ")}` },
      404,
      "no-store",
    );
  }

  const plugin = findPlugin(id);
  if (!plugin) return json({ error: "unknown agent" }, 404, "no-store");

  const query = Object.fromEntries(request.nextUrl.searchParams);

  try {
    if (action === "auto") {
      const wallet = request.nextUrl.searchParams.get("wallet");
      if (!isAddress(wallet)) return json({ error: "wallet is required" }, 400);
      // Null is an answer: the agent has nothing to work with on that wallet.
      return json(await plugin.autoParams(wallet));
    }

    // Null is an answer here too: an agent with no view today does not compete
    // for the wallet's money.
    if (action === "outlook") return json(plugin.outlook ? await plugin.outlook(query) : null);
    if (action === "status") return json(await plugin.status(query));
    if (action === "insights") return json(await plugin.insights(query));
    if (action === "scope") return json(await plugin.scope(query));

    const planned = await plugin.plan(query);
    if (!planned) return json({ action: null, reason: "nothing to do right now" }, 200, "no-store");
    return json(
      {
        action: {
          reason: planned.reason,
          // bigint does not survive JSON, and a tx value has to arrive intact.
          txs: planned.txs.map((tx) => ({ ...tx, value: (tx.value ?? 0n).toString() })),
        },
      },
      200,
      "no-store",
    );
  } catch (err) {
    const message = (err as Error).message.split("\n")[0];
    // Bad params are the caller's fault; anything else means a read failed.
    // Neither is worth remembering for a minute.
    return json({ error: message }, err instanceof InvalidParams ? 400 : 502, "no-store");
  }
}
