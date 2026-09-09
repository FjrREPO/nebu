import { bscBlockSeconds, bscClient, SECONDS_PER_YEAR } from "@nebu/core";
import type { Address } from "viem";

export const VENUS_COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;

const comptrollerAbi = [
  {
    name: "getAllMarkets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
] as const;

export const vTokenAbi = [
  {
    name: "underlying",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "supplyRatePerBlock",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getCash",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalBorrows",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalReserves",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "exchangeRateStored",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "redeemUnderlying",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Venus keys markets by its own vToken, so finding the market for an asset means
 * asking every market what it wraps. Cached: the list only changes on governance.
 */
let marketIndex: Promise<Map<Address, Address>> | undefined;
export function venusMarkets(): Promise<Map<Address, Address>> {
  marketIndex ??= (async () => {
    const markets = await bscClient.readContract({
      address: VENUS_COMPTROLLER,
      abi: comptrollerAbi,
      functionName: "getAllMarkets",
    });
    const pairs = await Promise.all(
      markets.map(async (vToken) => {
        // vBNB wraps the native coin and has no underlying() to read.
        const underlying = await bscClient
          .readContract({ address: vToken, abi: vTokenAbi, functionName: "underlying" })
          .catch(() => null);
        return underlying ? ([underlying.toLowerCase() as Address, vToken] as const) : null;
      }),
    );
    return new Map(pairs.filter((pair) => pair !== null));
  })();
  return marketIndex;
}

export async function venusMarketFor(asset: Address) {
  return (await venusMarkets()).get(asset.toLowerCase() as Address) ?? null;
}

/** Venus quotes a per-block rate, so the APY depends on how fast BSC is running. */
export async function supplyRateToApy(ratePerBlock: bigint) {
  const blocksPerYear = SECONDS_PER_YEAR / (await bscBlockSeconds());
  const perBlock = Number(ratePerBlock) / 1e18;
  return Math.expm1(blocksPerYear * Math.log1p(perBlock));
}

/** vTokens are a wrapper: underlying = vToken balance * exchangeRate / 1e18. */
export function underlyingBalance(vTokenBalance: bigint, exchangeRate: bigint) {
  return (vTokenBalance * exchangeRate) / 10n ** 18n;
}
