import { bscClient } from "@nebu/core";
import type { Address } from "viem";
import { erc20Abi, liquidityRateToApy, reserveData, reservesList } from "./aave.ts";
import { supplyRateToApy, venusMarketFor, vTokenAbi } from "./venus.ts";

export type VenueQuote = {
  asset: Address;
  symbol: string;
  aaveApy: number | null;
  venusApy: number | null;
};

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
      const venusApy = vToken
        ? await bscClient
            .readContract({ address: vToken, abi: vTokenAbi, functionName: "supplyRatePerBlock" })
            .then(supplyRateToApy)
            .catch(() => null)
        : null;
      return {
        asset,
        symbol,
        aaveApy: reserve ? liquidityRateToApy(reserve.currentLiquidityRate) : null,
        venusApy,
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
