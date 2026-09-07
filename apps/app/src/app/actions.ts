"use server";

import type { AgentParams, AgentStatus } from "@nebu/core";
import { findPlugin } from "@nebu/plugins";
import type { WirePlan } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: (err as Error).message.split("\n")[0] };
}

export async function readStatus(
  id: string,
  params: AgentParams,
): Promise<ActionResult<AgentStatus>> {
  const plugin = findPlugin(id);
  if (!plugin) return { ok: false, error: "unknown agent" };
  try {
    return { ok: true, data: await plugin.status(params) };
  } catch (err) {
    return fail(err);
  }
}

export async function buildPlan(
  id: string,
  params: AgentParams,
): Promise<ActionResult<WirePlan | null>> {
  const plugin = findPlugin(id);
  if (!plugin) return { ok: false, error: "unknown agent" };
  try {
    const action = await plugin.plan(params);
    if (!action) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        reason: action.reason,
        // bigint cannot cross the server boundary; the wallet parses it back.
        txs: action.txs.map((tx) => ({ ...tx, value: (tx.value ?? 0n).toString() })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}
