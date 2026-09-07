"use server";

import type { AgentParams, AgentStatus } from "@nebu/core";
import { POSITION_MANAGER, positionsOf } from "@nebu/plugin-pancakeswap";
import { findPlugin, plugins } from "@nebu/plugins";
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

export type PortfolioRow = {
  agentId: string;
  agentName: string;
  category: string;
  params: AgentParams;
  status: AgentStatus | null;
  error: string | null;
};

/**
 * Runs every agent against one wallet: the lending and grid agents take it
 * directly, the rebalancer gets the position NFTs that wallet actually holds.
 */
export async function scanWallet(wallet: string): Promise<ActionResult<PortfolioRow[]>> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, error: "not an address" };

  try {
    const positions = await positionsOf(POSITION_MANAGER, wallet as `0x${string}`).catch(() => []);

    const jobs = plugins.flatMap((plugin) => {
      const walletKey = plugin.paramSchema.find((spec) => spec.key === "wallet")?.key;
      if (walletKey) return [{ plugin, params: { ...plugin.example, wallet } }];
      // The rebalancer keys off a position id, so fan out over what the wallet owns.
      if (plugin.paramSchema.some((spec) => spec.key === "tokenId")) {
        return positions.map((tokenId) => ({ plugin, params: { tokenId } }));
      }
      return [{ plugin, params: plugin.example }];
    });

    return {
      ok: true,
      data: await Promise.all(
        jobs.map(async ({ plugin, params }) => {
          try {
            return {
              agentId: plugin.id,
              agentName: plugin.name,
              category: plugin.category,
              params,
              status: await plugin.status(params),
              error: null,
            };
          } catch (err) {
            return {
              agentId: plugin.id,
              agentName: plugin.name,
              category: plugin.category,
              params,
              status: null,
              error: (err as Error).message.split("\n")[0],
            };
          }
        }),
      ),
    };
  } catch (err) {
    return fail(err);
  }
}
