/**
 * Hire two agents and you no longer have two hires, you have a desk.
 *
 * They all spend from one wallet, so left alone they race: whoever runs first
 * takes the BNB and the others find an empty account. This decides the split
 * instead — how much of the wallet each hired agent is allowed to work with,
 * from what each one expects to earn and how rough the ride is.
 *
 * The numbers come from the agents themselves. Nothing here knows what a pool
 * or a lending market is; it only compares what they report.
 */

/**
 * "return" competes for capital on what it expects to earn. "reserve" is money
 * that has to be there rather than money at work — the health guard's
 * repayment buffer — so it comes off the top before anything is invested.
 */
export type OutlookKind = "return" | "reserve";

/** What an agent expects of the capital it is given. */
export type AgentOutlook = {
  /** Annualised, as a fraction: 0.42 is 42%. */
  apr: number;
  /** How much the thing behind that return moves in a day, as a fraction. */
  risk: number | null;
  kind: OutlookKind;
  /** For a reserve, the BNB it needs held back. Ignored otherwise. */
  needs?: number;
  /** One line, in the agent's own words, for the desk to show. */
  reason: string;
};

export type DeskAgent = { id: string; outlook: AgentOutlook };

export type Allocation = {
  id: string;
  /** Fraction of the wallet, 0–1. */
  share: number;
  /** BNB. */
  amount: number;
  /** What it won its share with. Reserves do not compete, so theirs is 0. */
  score: number;
  note: string;
};

/** Below this a move costs more in gas than it can earn. */
export const MIN_TICKET = 0.01;
/** However good it looks, one agent does not get the whole desk. */
export const MAX_SHARE = 0.6;
/** Insurance protects the desk; it must not become the desk. */
export const RESERVE_CAP = 0.5;
/**
 * The smallest slice worth calling a position.
 *
 * Spreading capital is worth something; a slice this side of a rounding error
 * is not diversifying, it is paying gas to hold something that cannot move the
 * result. Judged before the share cap, so an agent nobody rates does not
 * inherit a third of the desk simply for being the only one under the cap.
 */
export const MIN_SHARE = 0.03;
/**
 * Nothing is riskless. Without a floor, a stablecoin's near-zero volatility
 * divides into a score of thousands and takes everything.
 */
const FLOOR_RISK = 0.005;
/** What an agent that cannot say how much it moves is assumed to move. */
const UNKNOWN_RISK = 0.03;

const round = (bnb: number) => Math.round(bnb * 1e6) / 1e6;

/**
 * Risk-adjusted return: the same trade-off anyone makes by hand, which is why
 * it is one division rather than a model. Twice the yield for twice the swing
 * is not an improvement.
 */
function score(outlook: AgentOutlook) {
  if (outlook.kind === "reserve") return 0;
  const apr = Math.max(0, outlook.apr);
  return apr / Math.max(outlook.risk ?? UNKNOWN_RISK, FLOOR_RISK);
}

/**
 * Shares proportional to weight, with no one over the cap.
 *
 * The cap only means anything when there is somebody else to hand the excess
 * to: one agent alone gets the lot, and two cannot each be held under a half.
 * So the cap gives way to whatever an even split would be, or capital would
 * sit idle in the name of diversifying across one thing.
 *
 * Clamping the leader pushes its excess onto the others, which can push the
 * next one over, so this settles rather than clamps once.
 */
function capped(weights: number[]): number[] {
  const live = weights.filter((weight) => weight > 0).length;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (live === 0 || !(total > 0)) return weights.map(() => 0);

  const cap = Math.max(MAX_SHARE, 1 / live);
  let shares = weights.map((weight) => weight / total);

  for (let pass = 0; pass < 4; pass++) {
    const excess = shares.reduce((sum, share) => sum + Math.max(0, share - cap), 0);
    if (excess < 1e-12) break;
    const room = shares.reduce((sum, share) => sum + (share < cap ? share : 0), 0);
    if (!(room > 0)) break;
    shares = shares.map((share) => (share >= cap ? cap : share + (excess * share) / room));
  }
  return shares;
}

/**
 * Split a wallet across the agents working from it.
 *
 * Reserves first, then the rest by risk-adjusted return, then anything too
 * small to be worth its gas is handed back to the others. What is not
 * allocated stays in the wallet, which is a legitimate answer: if nothing on
 * offer pays for its risk, the desk sits on its hands.
 */
export function allocate(agents: DeskAgent[], total: number): Allocation[] {
  const idle = (agent: DeskAgent, note: string): Allocation => ({
    id: agent.id,
    share: 0,
    amount: 0,
    score: score(agent.outlook),
    note,
  });
  if (!(total > 0) || agents.length === 0) {
    return agents.map((agent) => idle(agent, "nothing in the wallet to work with"));
  }

  // Reserves come off the top, cut back pro-rata if together they ask for more
  // than the desk is willing to leave idle.
  const asked = agents.reduce(
    (sum, agent) =>
      agent.outlook.kind === "reserve" ? sum + Math.max(0, agent.outlook.needs ?? 0) : sum,
    0,
  );
  const trim = asked > total * RESERVE_CAP ? (total * RESERVE_CAP) / asked : 1;
  const held = agents.map((agent) =>
    agent.outlook.kind === "reserve" ? Math.max(0, agent.outlook.needs ?? 0) * trim : 0,
  );
  const investable = total - held.reduce((sum, amount) => sum + amount, 0);

  const scores = agents.map((agent, index) => (held[index] > 0 ? 0 : score(agent.outlook)));
  const rated = scores.reduce((sum, value) => sum + value, 0);
  const behind = scores.map((value) => value > 0 && value / rated < MIN_SHARE);
  const weights = scores.map((value, index) => (behind[index] ? 0 : value));
  let shares = capped(weights);

  // A ticket too small to cover its own gas is not an allocation, it is a fee.
  // Dropping one frees capital for the others, so the split is taken again
  // without it. ponytail: one re-run, not a loop to a fixed point — with four
  // agents the second pass has never moved anyone else below the line.
  const tiny = shares.map((share) => share * investable > 0 && share * investable < MIN_TICKET);
  if (tiny.some(Boolean)) {
    shares = capped(weights.map((weight, index) => (tiny[index] ? 0 : weight)));
  }

  return agents.map((agent, index) => {
    const amount = held[index] > 0 ? held[index] : shares[index] * investable;
    const enough = amount >= MIN_TICKET;
    return {
      id: agent.id,
      share: enough ? amount / total : 0,
      amount: enough ? round(amount) : 0,
      score: score(agent.outlook),
      note: enough
        ? held[index] > 0
          ? trim < 1
            ? "held back as cover, trimmed to keep the desk working"
            : "held back as cover"
          : agent.outlook.reason
        : agent.outlook.kind === "reserve"
          ? // Cover nobody needs is the agent doing its job, not sitting out.
            agent.outlook.reason
          : behind[index]
            ? "sitting out — its slice would be too small to be a position"
            : score(agent.outlook) > 0
              ? "its share would not cover the gas to place it"
              : "nothing worth funding here today",
    };
  });
}

/** What the desk is actually earning, once the split is applied. */
export function blendedApr(agents: DeskAgent[], allocations: Allocation[]): number {
  const byId = new Map(agents.map((agent) => [agent.id, agent.outlook]));
  return allocations.reduce((sum, entry) => {
    const outlook = byId.get(entry.id);
    return outlook && outlook.kind === "return"
      ? sum + entry.share * Math.max(0, outlook.apr)
      : sum;
  }, 0);
}
