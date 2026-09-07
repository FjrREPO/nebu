import {
  type AgentAction,
  type AgentPlugin,
  type AgentStatus,
  type AgentTx,
  bscClient,
  InvalidParams,
  requireAddress,
  requireInt,
} from "@nebu/core";
import { type Address, encodeFunctionData, formatUnits, parseUnits } from "viem";
import { AAVE_POOL, erc20Abi, liquidityRateToApy, poolAbi, reserveData } from "./aave.ts";
import { bestMove, type Venue } from "./venue.ts";
import { supplyRateToApy, underlyingBalance, venusMarketFor, vTokenAbi } from "./venus.ts";

const DEFAULT_MIN_GAIN_BPS = 25;

async function loadMarket(params: Record<string, string>) {
  const asset = requireAddress(params, "asset");
  const wallet = requireAddress(params, "wallet");
  const minGainBps = params.minGainBps ? requireInt(params, "minGainBps") : DEFAULT_MIN_GAIN_BPS;
  if (minGainBps < 0) throw new InvalidParams("minGainBps cannot be negative");

  const [symbol, decimals, reserve, vToken] = await Promise.all([
    bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
    bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
    reserveData(asset).catch(() => null),
    venusMarketFor(asset),
  ]);
  if (
    !reserve?.aTokenAddress ||
    reserve.aTokenAddress === "0x0000000000000000000000000000000000000000"
  ) {
    if (!vToken) throw new InvalidParams(`${symbol} is not listed on Aave V3 or Venus`);
  }

  const venues: Venue[] = [];

  if (reserve && reserve.aTokenAddress !== "0x0000000000000000000000000000000000000000") {
    const aTokenBalance = await bscClient.readContract({
      address: reserve.aTokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    });
    venues.push({
      protocol: "Aave V3",
      apy: liquidityRateToApy(reserve.currentLiquidityRate),
      supplied: Number(formatUnits(aTokenBalance, decimals)),
    });
  }

  if (vToken) {
    const [rate, exchangeRate, balance] = await Promise.all([
      bscClient.readContract({
        address: vToken,
        abi: vTokenAbi,
        functionName: "supplyRatePerBlock",
      }),
      bscClient.readContract({
        address: vToken,
        abi: vTokenAbi,
        functionName: "exchangeRateStored",
      }),
      bscClient.readContract({
        address: vToken,
        abi: vTokenAbi,
        functionName: "balanceOf",
        args: [wallet],
      }),
    ]);
    venues.push({
      protocol: "Venus",
      apy: await supplyRateToApy(rate),
      supplied: Number(formatUnits(underlyingBalance(balance, exchangeRate), decimals)),
    });
  }

  return {
    asset,
    wallet,
    symbol,
    decimals,
    minGainBps,
    vToken,
    aToken: reserve?.aTokenAddress,
    venues,
  };
}

type Market = Awaited<ReturnType<typeof loadMarket>>;

function withdrawTx(market: Market, protocol: string, amount: bigint): AgentTx {
  if (protocol === "Aave V3") {
    return {
      to: AAVE_POOL,
      data: encodeFunctionData({
        abi: poolAbi,
        functionName: "withdraw",
        args: [market.asset, amount, market.wallet],
      }),
    };
  }
  if (!market.vToken) throw new InvalidParams("no Venus market for this asset");
  return {
    to: market.vToken,
    data: encodeFunctionData({ abi: vTokenAbi, functionName: "redeemUnderlying", args: [amount] }),
  };
}

function depositTxs(market: Market, protocol: string, amount: bigint): AgentTx[] {
  const spender: Address = protocol === "Aave V3" ? AAVE_POOL : (market.vToken as Address);
  const approve: AgentTx = {
    to: market.asset,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
  };
  const supply: AgentTx =
    protocol === "Aave V3"
      ? {
          to: AAVE_POOL,
          data: encodeFunctionData({
            abi: poolAbi,
            functionName: "supply",
            args: [market.asset, amount, market.wallet, 0],
          }),
        }
      : {
          to: market.vToken as Address,
          data: encodeFunctionData({ abi: vTokenAbi, functionName: "mint", args: [amount] }),
        };
  return [approve, supply];
}

export const yieldOptimizer: AgentPlugin = {
  id: "lending-yield-optimizer",
  name: "Lending Yield Router",
  category: "yield",
  protocol: "Aave V3 + Venus",
  chainId: 56,
  summary:
    "Compares the live supply APY for one asset across Aave V3 and Venus and routes the deposit to whichever pays more, once the spread covers the round trip.",
  paramSchema: [
    { key: "asset", label: "Asset", placeholder: "0x55d398326f99059fF775485246999027B3197955" },
    { key: "wallet", label: "Wallet", placeholder: "0x..." },
    { key: "minGainBps", label: "Min gain (bps)", placeholder: "25" },
  ],
  example: {
    asset: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
    wallet: "0x498BeCEFB57f9a551E6E91941AaA48329caE5baF",
    minGainBps: "25",
  },

  async status(params): Promise<AgentStatus> {
    const market = await loadMarket(params);
    const quotes = market.venues
      .map((venue) => `${venue.protocol} ${(venue.apy * 100).toFixed(2)}%`)
      .join(" vs ");
    const move = bestMove(market.venues, market.minGainBps);
    const funded = market.venues.filter((venue) => venue.supplied > 0);

    return {
      headline: move
        ? `Move to ${move.to.protocol} for +${(move.gainBps / 100).toFixed(2)}%`
        : funded.length > 0
          ? "Already in the best venue"
          : "Nothing supplied yet",
      detail: `${market.symbol}: ${quotes}${funded.length ? ` · holding ${funded[0].supplied.toPrecision(6)} on ${funded[0].protocol}` : ""}`,
      actionable: move !== null,
    };
  },

  async plan(params): Promise<AgentAction | null> {
    const market = await loadMarket(params);
    const move = bestMove(market.venues, market.minGainBps);
    if (!move) return null;

    const amount = parseUnits(move.from.supplied.toFixed(market.decimals), market.decimals);
    if (amount === 0n) return null;

    return {
      reason: `Move ${move.from.supplied.toPrecision(6)} ${market.symbol} from ${move.from.protocol} (${(move.from.apy * 100).toFixed(2)}%) to ${move.to.protocol} (${(move.to.apy * 100).toFixed(2)}%), worth ${(move.gainBps / 100).toFixed(2)}% a year.`,
      txs: [
        withdrawTx(market, move.from.protocol, amount),
        ...depositTxs(market, move.to.protocol, amount),
      ],
    };
  },
};
