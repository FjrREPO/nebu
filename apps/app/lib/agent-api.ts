import type { AgentOutlook, AutoParams, SessionScope } from "@nebu/core";

/**
 * The panel talks to the agents over the same HTTP API everyone else uses.
 *
 * These were Server Actions, which is the obvious way to do it and the wrong
 * one here: an action's id is minted per build, so a tab left open across a
 * deploy calls an id the new server has never heard of and the user gets
 * "Server Action … was not found on the server" instead of a transaction. A
 * URL survives deploys. Nothing here mutates, so nothing is lost by asking
 * over HTTP.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** bigint does not survive JSON; the wallet parses the value back. */
export type WireTx = { to: `0x${string}`; data: `0x${string}`; value: string };

async function call<T>(path: string): Promise<ApiResult<T>> {
  try {
    // A plan is built for this moment, so no cache may answer for it.
    const response = await fetch(path, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: body?.error ?? `the agent service answered ${response.status}` };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message.split("\n")[0] };
  }
}

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** What the agent picks for itself once it can see a funded wallet. */
export const agentAuto = (id: string, wallet: string) =>
  call<AutoParams | null>(`/api/agents/${id}/auto?wallet=${wallet}`);

/** What the agent expects of capital, for the desk to split a wallet by. */
export const agentOutlook = (id: string, params: Record<string, string>) =>
  call<AgentOutlook | null>(`/api/agents/${id}/outlook?${query(params)}`);

/** The narrowest session that still lets the agent do its job. */
export const agentScope = (id: string, params: Record<string, string>) =>
  call<SessionScope>(`/api/agents/${id}/scope?${query(params)}`);

export async function buildPlan(
  id: string,
  params: Record<string, string>,
): Promise<ApiResult<{ reason: string; txs: WireTx[] } | null>> {
  const result = await call<{ action: { reason: string; txs: WireTx[] } | null }>(
    `/api/agents/${id}/plan?${query(params)}`,
  );
  return result.ok ? { ok: true, data: result.data.action } : result;
}
