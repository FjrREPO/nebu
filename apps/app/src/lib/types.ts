import type { AgentCategory, AgentParams, AgentStatus, ParamSpec } from "@nebu/core";

export type { AgentCategory, AgentParams, AgentStatus, ParamSpec };

/** A plugin flattened for the client — everything but the functions. */
export type AgentMeta = {
  id: string;
  name: string;
  category: AgentCategory;
  protocol: string;
  chainId: number;
  summary: string;
  paramSchema: ParamSpec[];
  example: AgentParams;
};

export type AgentCardData = AgentMeta & {
  status: AgentStatus | null;
  error: string | null;
};

/** A plan as it crosses to the browser: bigint values become strings. */
export type WireTx = { to: `0x${string}`; data: `0x${string}`; value: string };
export type WirePlan = { reason: string; txs: WireTx[] };

export const CATEGORIES = [
  { key: "rebalancing", label: "Rebalancing", blurb: "Keeps LP ranges around the live price" },
  { key: "grid", label: "Grid trading", blurb: "Buys low and sells high on a ladder" },
  { key: "yield", label: "Yield optimisation", blurb: "Routes deposits to the best APY" },
  { key: "health", label: "Health factor", blurb: "Defends lending positions from liquidation" },
] as const satisfies readonly { key: AgentCategory; label: string; blurb: string }[];
