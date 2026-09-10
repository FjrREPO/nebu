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

/** One number on the agent's performance strip. */
export type StatTile = { label: string; value: string; hint?: string };

export type TableColumn = { key: string; label: string; align?: "start" | "end" };
/**
 * A row's `href` makes its first cell a link, `logo`/`logoAlt` put icons in
 * front of it, and `spark` (comma-joined values, oldest first) draws the
 * trend line at the far right. Everything else is matched to a column by key.
 */
export type TableRow = { id: string } & Record<string, string>;

/** The agent's own working data — what it looks at to decide. */
export type AgentTable = {
  title: string;
  caption?: string;
  /** What window the rows' `spark` covers, e.g. "24h". Shown as the column head. */
  sparkLabel?: string;
  columns: TableColumn[];
  rows: TableRow[];
};

export type ActivityEntry = {
  id: string;
  kind: string;
  text: string;
  status: "success" | "pending" | "failed";
  /** Unix seconds, so the client can render it in the reader's locale. */
  timestamp: number;
  hash?: string;
};

/** A contract the session may call, and why. */
export type ScopedCall = { to: `0x${string}`; label: string };

/** A token the session may move, with a cap the user sets before granting. */
export type ScopedSpend = {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  /** A sensible starting cap, in whole tokens, that the user can lower. */
  suggested: string;
};

/**
 * Exactly what a session key needs to be allowed to do for this agent to work,
 * and nothing else. Derived from the same params plan() will use, so the grant
 * cannot drift from the calls the agent actually makes.
 */
export type SessionScope = {
  calls: ScopedCall[];
  spend: ScopedSpend[];
  /**
   * BNB the session may move, in whole BNB.
   *
   * Wrapping a deposit sends native value, and native value needs its own
   * permission — a session with token allowances but no native one reverts at
   * validation with NoSpendPermissions the first time it tries to wrap.
   */
  nativeSpend?: string;
};

import type { AgentOutlook } from "./desk.ts";

/** One reading in an agent's history: unix seconds, and the value. */
export type SeriesPoint = { t: number; v: number };

/**
 * The agent's own number over time — its health factor, how far its position
 * has drifted, the spread it is chasing. Not a token price: the thing the
 * agent is actually paid to watch.
 */
/** What the agent chose for itself, and the reasoning to show the user. */
export type AutoParams = {
  params: AgentParams;
  /** One line explaining the choice, e.g. "picked CAKE/WBNB, 76% fee APR". */
  reason: string;
};

export type AgentSeries = {
  label: string;
  points: SeriesPoint[];
  /** Suffix for the value, e.g. "%" or " bps". */
  unit?: string;
  /** Drawn as a shaded band, for a metric with a healthy range. */
  band?: { from: number; to: number };
  /** Icons for whatever the label names, so a card is not all text. */
  logos?: string[];
};

/** One thing an agent is holding, valued in BNB. */
export type Holding = {
  token: string;
  symbol: string;
  amount: number;
  /** Worth in BNB, or null when the feed will not price it. */
  bnb: number | null;
};

export type AgentHoldings = {
  items: Holding[];
  /**
   * What today's holding was worth, hour by hour, over the last two days. Not
   * a record of the account — the amounts are today's — but it is what the
   * market did to them, which is the part nobody stores.
   *
   * In BNB and in dollars, because they say different things: a wallet holding
   * only BNB is flat in BNB and not flat at all in dollars.
   */
  history: SeriesPoint[];
  usd: SeriesPoint[];
};

/** Everything the agent detail page shows beyond a headline. */
export type AgentInsights = {
  stats: StatTile[];
  table?: AgentTable;
  activity?: ActivityEntry[];
};

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
  /** Live params the marketplace card uses so a visitor sees real data first. */
  example: AgentParams;
  /** What the wallet hands over when it hires this agent. Plain, and true. */
  grants: string[];
  status(params: AgentParams): Promise<AgentStatus>;
  /** The agent's working data for its detail page. */
  insights(params: AgentParams): Promise<AgentInsights>;
  /** The narrowest session permissions under which plan() can still run. */
  scope(params: AgentParams): Promise<SessionScope>;
  /** History of the number this agent watches, for the marketplace card. */
  series(params: AgentParams): Promise<AgentSeries | null>;
  /**
   * Params the agent picks for itself, given nothing but a funded wallet.
   *
   * This is what lets a user deposit BNB and stop there: the agent already
   * screens the pools and compares the rates, so it can choose its own venue.
   * It returns null when it has nothing to work with — either the wallet is
   * empty, or the agent watches a position the user must already hold.
   */
  autoParams(wallet: `0x${string}`): Promise<AutoParams | null>;
  /** The tx to run, or null when there is nothing to do. */
  plan(params: AgentParams): Promise<AgentAction | null>;
  /**
   * What this agent expects of the capital it is given, so a wallet running
   * several of them can decide who gets what. Optional: an agent with no view
   * today simply does not compete for the money.
   */
  outlook?(params: AgentParams): Promise<AgentOutlook | null>;
  /**
   * What this agent is already working with, in BNB, so the desk can compare
   * where the money is against where it should be. Zero is an answer — the
   * agent holds nothing — and null means it cannot price what it holds.
   */
  deployed?(params: AgentParams): Promise<number | null>;
  /**
   * The actual things this agent is holding, so a wallet can show a portfolio
   * rather than a number: which tokens, how many, what they are worth, and
   * what that same holding was worth over the last two days.
   */
  holdings?(params: AgentParams): Promise<AgentHoldings>;
}

/** The caller sent bad params — a 400, not a broken agent. */
export class InvalidParams extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParams";
  }
}
