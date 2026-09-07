import {
  type AgentAction,
  type AgentPlugin,
  type AgentStatus,
  type AgentTx,
  bscClient,
  InvalidParams,
  requireInt,
} from "@nebu/core";
import { type Address, encodeFunctionData, maxUint128 } from "viem";
import { erc20Abi, POSITION_MANAGER, poolAbi, positionManagerAbi } from "./abi.ts";
import {
  formatPrice,
  inRange,
  poolAddress,
  slot0,
  snapToSpacing,
  tickToPrice,
  tokenMeta,
} from "./pool.ts";

const DEADLINE_SECONDS = 20 * 60;

function tokenId(params: Record<string, string>) {
  const raw = requireInt(params, "tokenId");
  if (raw <= 0) throw new InvalidParams("tokenId must be positive");
  return BigInt(raw);
}

async function loadPosition(id: bigint) {
  const position = await bscClient
    .readContract({
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "positions",
      args: [id],
    })
    .catch(() => {
      throw new InvalidParams(`position #${id} does not exist`);
    });

  const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = position;
  const pool = await poolAddress(token0, token1, fee);
  const [[, tick], spacing, meta0, meta1] = await Promise.all([
    slot0(pool),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "tickSpacing" }),
    tokenMeta(token0),
    tokenMeta(token1),
  ]);

  return {
    id,
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    liquidity,
    pool,
    tick,
    spacing,
    meta0,
    meta1,
  };
}

type Position = Awaited<ReturnType<typeof loadPosition>>;

/** Same tick width as before, recentred on where the pool actually trades now. */
export function recentre(position: Pick<Position, "tick" | "tickLower" | "tickUpper" | "spacing">) {
  const halfWidth = Math.round((position.tickUpper - position.tickLower) / 2);
  const centre = snapToSpacing(position.tick, position.spacing);
  return {
    tickLower: snapToSpacing(centre - halfWidth, position.spacing),
    tickUpper: snapToSpacing(centre + halfWidth, position.spacing),
  };
}

function describe(position: Position) {
  const { meta0, meta1 } = position;
  const price = (tick: number) => formatPrice(tickToPrice(tick, meta0.decimals, meta1.decimals));
  return `${meta0.symbol}/${meta1.symbol} at ${price(position.tick)}, range ${price(position.tickLower)}-${price(position.tickUpper)}`;
}

export const pancakeRebalancer: AgentPlugin = {
  id: "pancakeswap-v3-rebalancer",
  name: "PancakeSwap V3 Rebalancer",
  category: "rebalancing",
  protocol: "PancakeSwap V3",
  chainId: 56,
  summary:
    "Watches a concentrated liquidity position and recentres its range on the live pool price when it drifts out and stops earning fees.",
  paramSchema: [{ key: "tokenId", label: "Position NFT id", placeholder: "7366225" }],

  async status(params): Promise<AgentStatus> {
    const position = await loadPosition(tokenId(params));
    const live = inRange(position.tick, position.tickLower, position.tickUpper);
    return {
      headline: live ? "In range, earning fees" : "Out of range, earning nothing",
      detail: describe(position),
      actionable: !live && position.liquidity > 0n,
    };
  },

  async plan(params): Promise<AgentAction | null> {
    const position = await loadPosition(tokenId(params));
    if (inRange(position.tick, position.tickLower, position.tickUpper)) return null;
    if (position.liquidity === 0n) return null;

    const owner = await bscClient.readContract({
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "ownerOf",
      args: [position.id],
    });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    // Ask the chain what the exit actually returns rather than estimating it.
    const { result: withdrawn } = await bscClient.simulateContract({
      account: owner,
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: position.id,
          liquidity: position.liquidity,
          amount0Min: 0n,
          amount1Min: 0n,
          deadline,
        },
      ],
    });
    const [amount0, amount1] = withdrawn;

    const exit = encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({
            abi: positionManagerAbi,
            functionName: "decreaseLiquidity",
            args: [
              {
                tokenId: position.id,
                liquidity: position.liquidity,
                amount0Min: 0n,
                amount1Min: 0n,
                deadline,
              },
            ],
          }),
          encodeFunctionData({
            abi: positionManagerAbi,
            functionName: "collect",
            args: [
              {
                tokenId: position.id,
                recipient: owner,
                amount0Max: maxUint128,
                amount1Max: maxUint128,
              },
            ],
          }),
        ],
      ],
    });

    const range = recentre(position);
    const txs: AgentTx[] = [{ to: POSITION_MANAGER, data: exit }];

    for (const [token, amount] of [
      [position.token0, amount0],
      [position.token1, amount1],
    ] as const) {
      if (amount === 0n) continue;
      const allowance = await bscClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, POSITION_MANAGER],
      });
      if (allowance >= amount) continue;
      // Approve the exact amount this rebalance needs, never an unlimited allowance.
      txs.push({
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [POSITION_MANAGER, amount],
        }),
      });
    }

    txs.push({
      to: POSITION_MANAGER,
      data: encodeFunctionData({
        abi: positionManagerAbi,
        functionName: "mint",
        args: [
          {
            token0: position.token0,
            token1: position.token1,
            fee: position.fee,
            tickLower: range.tickLower,
            tickUpper: range.tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            // ponytail: desired is already the cap and the router refunds the
            // remainder, so a zero floor cannot overspend — it only lets the
            // mint through when the pool ratio shifted between plan and signing.
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: owner as Address,
            deadline,
          },
        ],
      }),
    });

    const price = (tick: number) =>
      formatPrice(tickToPrice(tick, position.meta0.decimals, position.meta1.decimals));
    return {
      reason: `Exit the stale ${price(position.tickLower)}-${price(position.tickUpper)} range, collect fees, and remint at ${price(range.tickLower)}-${price(range.tickUpper)} around the live price.`,
      txs,
    };
  },
};
