/** The four agent categories the marketplace must cover. */
export type AgentCategory = "rebalancing" | "grid" | "yield" | "health";

export type ChainId = 56 | 97;

/** What the marketplace card shows. Must come from live data, never a constant. */
export type AgentStatus = {
  /** Headline metric, e.g. "12.4% APR" or "HF 1.32". */
  headline: string;
  detail?: string;
  /** True when the agent would act right now. */
  actionable: boolean;
};

/** A transaction the agent wants signed. */
export type AgentAction = {
  /** Shown to the user before signing. */
  reason: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
};

export interface AgentPlugin<P = Record<string, string>> {
  id: string;
  name: string;
  category: AgentCategory;
  /** Protocol the agent operates on, e.g. "PancakeSwap V3". */
  protocol: string;
  chainId: ChainId;
  /** Params the user fills in on the agent card. */
  paramSchema: { key: keyof P & string; label: string; placeholder?: string }[];
  status(params: P): Promise<AgentStatus>;
  /** The tx to run, or null when there is nothing to do. */
  plan(params: P): Promise<AgentAction | null>;
}
