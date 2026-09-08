"use server";

import type { AgentParams, SessionScope } from "@nebu/core";
import { findPlugin } from "@nebu/plugins";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type WireTx = { to: `0x${string}`; data: `0x${string}`; value: string };

const fail = (err: unknown) =>
  ({ ok: false, error: (err as Error).message.split("\n")[0] }) as const;

export async function agentScope(
  id: string,
  params: AgentParams,
): Promise<ActionResult<SessionScope>> {
  const plugin = findPlugin(id);
  if (!plugin) return { ok: false, error: "unknown agent" };
  try {
    return { ok: true, data: await plugin.scope(params) };
  } catch (err) {
    return fail(err);
  }
}

export async function buildPlan(
  id: string,
  params: AgentParams,
): Promise<ActionResult<{ reason: string; txs: WireTx[] } | null>> {
  const plugin = findPlugin(id);
  if (!plugin) return { ok: false, error: "unknown agent" };
  try {
    const action = await plugin.plan(params);
    if (!action) return { ok: true, data: null };
    return {
      ok: true,
      // bigint cannot cross the server boundary; the wallet parses it back.
      data: {
        reason: action.reason,
        txs: action.txs.map((tx) => ({ ...tx, value: (tx.value ?? 0n).toString() })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}
