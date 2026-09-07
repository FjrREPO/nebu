import type { AgentPlugin, AgentStatus } from "@nebu/core";
import { createPublicClient, http, type Address } from "viem";
import { bsc } from "viem/chains";

const client = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL),
});

const slot0Abi = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint32" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

type Params = { pool: string; tickLower: string; tickUpper: string };

/** A V3 LP position earns fees only while the pool tick sits inside its range. */
export function inRange(tick: number, lower: number, upper: number) {
  return tick >= lower && tick < upper;
}

export async function poolTick(pool: Address) {
  const [, tick] = await client.readContract({
    address: pool,
    abi: slot0Abi,
    functionName: "slot0",
  });
  return tick;
}

export const pancakeRebalancer: AgentPlugin<Params> = {
  id: "pancakeswap-v3-rebalancer",
  name: "PancakeSwap V3 Rebalancer",
  category: "rebalancing",
  protocol: "PancakeSwap V3",
  chainId: 56,
  paramSchema: [
    { key: "pool", label: "Pool address", placeholder: "0x…" },
    { key: "tickLower", label: "Tick lower" },
    { key: "tickUpper", label: "Tick upper" },
  ],

  async status({ pool, tickLower, tickUpper }): Promise<AgentStatus> {
    const tick = await poolTick(pool as Address);
    const lower = Number(tickLower);
    const upper = Number(tickUpper);
    const live = inRange(tick, lower, upper);
    return {
      headline: live ? "In range" : "Out of range",
      detail: `tick ${tick} vs [${lower}, ${upper})`,
      actionable: !live,
    };
  },

  // ponytail: no calldata yet — burn + collect + mint via NonfungiblePositionManager
  // is the next step; status() already tells the UI when a rebalance is due.
  async plan() {
    return null;
  },
};
