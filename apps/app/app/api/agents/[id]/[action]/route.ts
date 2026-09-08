import { InvalidParams } from "@nebu/core";
import { findPlugin } from "@nebu/plugins";
import { type NextRequest, NextResponse } from "next/server";

export const revalidate = 60;

const CORS = { "access-control-allow-origin": "*" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

const ACTIONS = ["status", "auto", "insights", "plan"] as const;
type Action = (typeof ACTIONS)[number];

const isAddress = (value: string | null): value is `0x${string}` =>
  value !== null && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * The same four calls the marketplace makes, over HTTP, so an agent runner or
 * another team's tooling can use this registry without importing it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await context.params;
  if (!ACTIONS.includes(action as Action)) {
    return json({ error: `unknown action, expected one of ${ACTIONS.join(", ")}` }, 404);
  }

  const plugin = findPlugin(id);
  if (!plugin) return json({ error: "unknown agent" }, 404);

  const query = Object.fromEntries(request.nextUrl.searchParams);

  try {
    if (action === "auto") {
      const wallet = request.nextUrl.searchParams.get("wallet");
      if (!isAddress(wallet)) return json({ error: "wallet is required" }, 400);
      // Null is an answer: the agent has nothing to work with on that wallet.
      return json(await plugin.autoParams(wallet));
    }

    if (action === "status") return json(await plugin.status(query));
    if (action === "insights") return json(await plugin.insights(query));

    const planned = await plugin.plan(query);
    if (!planned) return json({ action: null, reason: "nothing to do right now" });
    return json({
      action: {
        reason: planned.reason,
        // bigint does not survive JSON, and a tx value has to arrive intact.
        txs: planned.txs.map((tx) => ({ ...tx, value: (tx.value ?? 0n).toString() })),
      },
    });
  } catch (err) {
    const message = (err as Error).message.split("\n")[0];
    // Bad params are the caller's fault; anything else means a read failed.
    return json({ error: message }, err instanceof InvalidParams ? 400 : 502);
  }
}
