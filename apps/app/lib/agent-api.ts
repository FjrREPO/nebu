import type {
  AgentHoldings,
  AgentOutlook,
  AutoParams,
  SeriesPoint,
  SessionScope,
} from "@nebu/core";

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

async function call<T>(path: string, cache: RequestCache = "default"): Promise<ApiResult<T>> {
  try {
    // The route says how long each answer keeps; only a plan refuses to be
    // cached, and it asks for that itself.
    const response = await fetch(path, { cache });
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

/** What the agent already has at work, in BNB. */
export const agentDeployed = (id: string, params: Record<string, string>) =>
  call<number | null>(`/api/agents/${id}/deployed?${query(params)}`);

/** What the agent is holding, priced now and over the last two days. */
export const agentHoldings = (id: string, params: Record<string, string>) =>
  call<AgentHoldings>(`/api/agents/${id}/holdings?${query(params)}`);

/** The narrowest session that still lets the agent do its job. */
export const agentScope = (id: string, params: Record<string, string>) =>
  call<SessionScope>(`/api/agents/${id}/scope?${query(params)}`);

export async function buildPlan(
  id: string,
  params: Record<string, string>,
): Promise<ApiResult<{ reason: string; txs: WireTx[] } | null>> {
  // A plan is built for this moment, so no cache may answer for it.
  const result = await call<{ action: { reason: string; txs: WireTx[] } | null }>(
    `/api/agents/${id}/plan?${query(params)}`,
    "no-store",
  );
  return result.ok ? { ok: true, data: result.data.action } : result;
}

/** BNB in dollars, now and over the last two days. */
export const bnbMarket = () =>
  call<{ usd: number | null; history: SeriesPoint[] }>("/api/market/bnb");
