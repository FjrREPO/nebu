/** The four agent categories the marketplace must cover. */
export type AgentCategory = "rebalancing" | "grid" | "yield" | "health";

export type ChainId = 56 | 97;

/** What the marketplace card shows. Must come from live data, never a constant. */
export type AgentStatus = {
  /** Headline metric, e.g. "12.4% APY" or "HF 1.32". */
  headline: string;
  detail?: string;
  /** True when the agent would act right now. */
  actionable: boolean;
};

export type AgentTx = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
};

/**
 * What the agent wants signed. DeFi moves rarely fit in one call (approve then
 * act, exit then re-enter), so this is a sequence the wallet sends in order.
 */
export type AgentAction = {
  /** Shown to the user before signing. */
  reason: string;
  txs: AgentTx[];
};

export type ParamSpec = {
  key: string;
  label: string;
  placeholder?: string;
};

/**
 * Params arrive as strings from a query string or a form, so every plugin
 * parses and validates its own. Throw {@link InvalidParams} when they are wrong.
 */
export type AgentParams = Record<string, string>;

export interface AgentPlugin {
  id: string;
  name: string;
  category: AgentCategory;
  /** Protocol the agent operates on, e.g. "PancakeSwap V3". */
  protocol: string;
  chainId: ChainId;
  /** One-line pitch for the marketplace card. */
  summary: string;
  paramSchema: ParamSpec[];
  status(params: AgentParams): Promise<AgentStatus>;
  /** The tx to run, or null when there is nothing to do. */
  plan(params: AgentParams): Promise<AgentAction | null>;
}

/** The caller sent bad params — a 400, not a broken agent. */
export class InvalidParams extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParams";
  }
}
