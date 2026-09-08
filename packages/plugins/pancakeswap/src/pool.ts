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
