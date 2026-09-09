import { bscClient } from "@nebu/core";
import type { Address } from "viem";
import { erc20Abi, FACTORY, factoryAbi, poolAbi } from "./abi.ts";

export type TokenMeta = { address: Address; symbol: string; decimals: number };

const tokenCache = new Map<Address, Promise<TokenMeta>>();

export function tokenMeta(address: Address): Promise<TokenMeta> {
  let hit = tokenCache.get(address);
  if (!hit) {
    hit = Promise.all([
      bscClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      bscClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]).then(([symbol, decimals]) => ({ address, symbol, decimals }));
    tokenCache.set(address, hit);
  }
  return hit;
}

export function poolAddress(token0: Address, token1: Address, fee: number) {
  return bscClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "getPool",
    args: [token0, token1, fee],
  });
}

export function slot0(pool: Address) {
  return bscClient.readContract({ address: pool, abi: poolAbi, functionName: "slot0" });
}

/**
 * A V3 tick is a log-scale price: 1.0001^tick token1 per token0, before the two
 * tokens' decimals are taken out.
 */
export function tickToPrice(tick: number, decimals0: number, decimals1: number) {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1);
}

export function priceToTick(price: number, decimals0: number, decimals1: number) {
  return Math.round(Math.log(price / 10 ** (decimals0 - decimals1)) / Math.log(1.0001));
}

/** A position earns fees only while the pool tick sits inside its range. */
export function inRange(tick: number, lower: number, upper: number) {
  return tick >= lower && tick < upper;
}

/** Ticks are only valid on multiples of the pool's spacing. */
export function snapToSpacing(tick: number, spacing: number) {
  return Math.round(tick / spacing) * spacing;
}

/**
 * Fixed decimal places made one sentence disagree with itself: a price just
 * under 1 got eight of them and one just over got four, so "at 0.99850120,
 * range 0.99890066-1.0038" was three numbers in two formats. Significant
 * figures read the same on both sides of that boundary.
 */
export function formatPrice(price: number) {
  if (!Number.isFinite(price) || price === 0) return "0";
  return price.toLocaleString("en-US", { maximumSignificantDigits: 5, useGrouping: false });
}

const enumerableAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Every PancakeSwap V3 position NFT a wallet holds, newest first. */
export async function positionsOf(manager: Address, owner: Address, limit = 12) {
  const balance = await bscClient.readContract({
    address: manager,
    abi: enumerableAbi,
    functionName: "balanceOf",
    args: [owner],
  });
  const count = Number(balance < BigInt(limit) ? balance : BigInt(limit));
  const ids = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      bscClient.readContract({
        address: manager,
        abi: enumerableAbi,
        functionName: "tokenOfOwnerByIndex",
        args: [owner, balance - 1n - BigInt(index)],
      }),
    ),
  );
  return ids.map(String);
}

/**
 * Fees a V3 position has earned and not yet taken out.
 *
 * `tokensOwed` on the position only moves when the position is touched, so on
 * anything left alone it reads zero however much it has made. The real figure
 * lives in fee growth: what the pool has accrued per unit of liquidity inside
 * the position's range, minus what it had accrued when the position last
 * looked. Subtraction here wraps on purpose — the contracts let these counters
 * overflow and rely on the difference still being right.
 */
const Q128 = 1n << 128n;
const Q256 = 1n << 256n;
const wrapSub = (a: bigint, b: bigint) => (a - b + Q256) % Q256;

/**
 * What a position actually holds, from its liquidity and where the price sits.
 *
 * A V3 position is not a pile of two tokens, it is a curve: the same liquidity
 * is all of one side below its range, all of the other above it, and a mix in
 * between. These are the standard formulas for that, in whole tokens.
 *
 * Done in floating point rather than the fixed-point the pool uses. That is
 * exact enough to value a position and nowhere near exact enough to build a
 * transaction from — nothing here is used for calldata.
 */
export function positionAmounts(input: {
  liquidity: bigint;
  tick: number;
  tickLower: number;
  tickUpper: number;
  decimals0: number;
  decimals1: number;
}) {
  const liquidity = Number(input.liquidity);
  const root = (tick: number) => 1.0001 ** (tick / 2);
  const lower = root(input.tickLower);
  const upper = root(input.tickUpper);
  // Outside its range the price is clamped to the edge, which is what makes
  // one of the two amounts fall to zero.
  const here = Math.min(Math.max(root(input.tick), lower), upper);

  return {
    amount0: (liquidity * (1 / here - 1 / upper)) / 10 ** input.decimals0,
    amount1: (liquidity * (here - lower)) / 10 ** input.decimals1,
  };
}

export function feesEarned(input: {
  liquidity: bigint;
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  feeGrowthGlobalX128: bigint;
  feeGrowthOutsideLowerX128: bigint;
  feeGrowthOutsideUpperX128: bigint;
  feeGrowthInsideLastX128: bigint;
  owed: bigint;
}) {
  const below =
    input.tickCurrent >= input.tickLower
      ? input.feeGrowthOutsideLowerX128
      : wrapSub(input.feeGrowthGlobalX128, input.feeGrowthOutsideLowerX128);
  const above =
    input.tickCurrent < input.tickUpper
      ? input.feeGrowthOutsideUpperX128
      : wrapSub(input.feeGrowthGlobalX128, input.feeGrowthOutsideUpperX128);

  const inside = wrapSub(wrapSub(input.feeGrowthGlobalX128, below), above);
  const gained = (input.liquidity * wrapSub(inside, input.feeGrowthInsideLastX128)) / Q128;
  return input.owed + gained;
}
