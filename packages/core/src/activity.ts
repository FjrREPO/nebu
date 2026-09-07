import type { AbiEvent, Address } from "viem";
import { bscClient } from "./chain.ts";
import type { ActivityEntry } from "./types.ts";

/** Public BSC endpoints reject wider log queries, so this is the ceiling. */
export const LOG_SPAN = 9_000n;

export type EventFeed = {
  address: Address;
  event: AbiEvent;
  kind: string;
  describe(args: Record<string, unknown>): string | null;
};

/**
 * Recent on-chain activity inside the agent's scope. It is the protocol moving,
 * not a fabricated history — the UI says which window it covers.
 */
export async function recentActivity(feeds: EventFeed[], limit = 8): Promise<ActivityEntry[]> {
  const latest = await bscClient.getBlockNumber();
  const fromBlock = latest - LOG_SPAN;

  const batches = await Promise.all(
    feeds.map((feed) =>
      bscClient
        .getLogs({ address: feed.address, event: feed.event, fromBlock, toBlock: latest })
        .then((logs) => logs.map((log) => ({ log, feed })))
        .catch(() => []),
    ),
  );

  const entries = batches
    .flat()
    .sort((a, b) => Number(b.log.blockNumber - a.log.blockNumber))
    .slice(0, limit * 2)
    .map(({ log, feed }) => {
      const text = feed.describe((log.args ?? {}) as Record<string, unknown>);
      if (!text) return null;
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: feed.kind,
        text,
        status: "success" as const,
        // Block time, approximated from the head — good enough for "3m ago".
        timestamp: Math.floor(Date.now() / 1000) - Number(latest - log.blockNumber) * 0.45,
        hash: log.transactionHash,
      };
    })
    .filter((entry) => entry !== null);

  return entries.slice(0, limit);
}
