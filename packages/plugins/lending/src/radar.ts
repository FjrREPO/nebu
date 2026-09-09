import { bscClient } from "@nebu/core";
import type { Address } from "viem";
import { erc20Abi, liquidityRateToApy, reserveData, reservesList } from "./aave.ts";
import { supplyRateToApy, venusMarketFor, vTokenAbi } from "./venus.ts";

export type VenueQuote = {
  asset: Address;
  symbol: string;
  aaveApy: number | null;
  venusApy: number | null;
  /**
   * How much of each venue's supply is already lent out, 0 to 1.
   *
   * A rate is only half the story. At 95% utilisation the money is there on
   * paper and not in practice — withdrawing means waiting for a borrower to
   * repay, and the agent was routing on yield alone as if the two were the
   * same deposit.
   */
  aaveUsed: number | null;
  venusUsed: number | null;
};

/** Borrowed over supplied, guarding the empty market. */
export const used = (borrowed: bigint, supplied: bigint) =>
  supplied > 0n ? Number(borrowed) / Number(supplied) : 0;

/**
 * Every asset Aave lists on BSC, quoted against Venus. This is the table the
 * router picks from, so it is the table the agent page shows.
 */
export async function yieldRadar(): Promise<VenueQuote[]> {
  const assets = await reservesList();
  const quotes = await Promise.all(
    assets.map(async (asset): Promise<VenueQuote> => {
      const [symbol, reserve, vToken] = await Promise.all([
        bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
        reserveData(asset).catch(() => null),
        venusMarketFor(asset),
      ]);
      const onVenus = { address: vToken as Address, abi: vTokenAbi } as const;
      const [venusApy, cash, borrows, reserves] = vToken
        ? await Promise.all([
            bscClient
              .readContract({ ...onVenus, functionName: "supplyRatePerBlock" })
              .then(supplyRateToApy)
              .catch(() => null),
            bscClient.readContract({ ...onVenus, functionName: "getCash" }).catch(() => null),
            bscClient.readContract({ ...onVenus, functionName: "totalBorrows" }).catch(() => null),
            bscClient.readContract({ ...onVenus, functionName: "totalReserves" }).catch(() => null),
          ])
        : [null, null, null, null];

      // Aave keeps its supply in the aToken and its debt in the variable debt
      // token; Venus keeps what is left in the contract and counts the rest.
      const aaveSides =
        reserve?.aTokenAddress && reserve.variableDebtTokenAddress
          ? await Promise.all([
              bscClient
                .readContract({
                  address: reserve.aTokenAddress,
                  abi: erc20Abi,
                  functionName: "totalSupply",
                })
                .catch(() => null),
              bscClient
                .readContract({
                  address: reserve.variableDebtTokenAddress,
                  abi: erc20Abi,
                  functionName: "totalSupply",
                })
                .catch(() => null),
            ])
          : [null, null];

      return {
        asset,
        symbol,
        aaveApy: reserve ? liquidityRateToApy(reserve.currentLiquidityRate) : null,
        venusApy,
        aaveUsed:
          aaveSides[0] !== null && aaveSides[1] !== null ? used(aaveSides[1], aaveSides[0]) : null,
        venusUsed:
          cash !== null && borrows !== null && reserves !== null
            ? used(borrows, cash + borrows - reserves)
            : null,
      };
    }),
  );
  return quotes.sort((a, b) => bestApy(b) - bestApy(a));
}

export const bestApy = (quote: VenueQuote) => Math.max(quote.aaveApy ?? 0, quote.venusApy ?? 0);

/** How much the better venue pays over the worse one, in basis points. */
export function spreadBps(quote: VenueQuote) {
  if (quote.aaveApy === null || quote.venusApy === null) return null;
  return Math.round(Math.abs(quote.aaveApy - quote.venusApy) * 10_000);
}

export const pct = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
