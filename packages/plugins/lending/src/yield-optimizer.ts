import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentSeries,
  type AgentStatus,
  type AgentTx,
  alignDaily,
  apyHistory,
  bscClient,
  InvalidParams,
  marketId,
  recentActivity,
  requireAddress,
  requireInt,
  type SessionScope,
} from "@nebu/core";
import { type Address, encodeFunctionData, formatUnits, parseAbiItem, parseUnits } from "viem";
import { AAVE_POOL, erc20Abi, liquidityRateToApy, poolAbi, reserveData } from "./aave.ts";
import { bestApy, pct, spreadBps, yieldRadar } from "./radar.ts";
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
  grants: [
    "Reads both protocols' supply rates and where your deposit currently sits",
    "Withdraws only the asset you named, only to your own wallet",
    "Approves the destination for the exact amount being moved",
    "Cannot borrow, and cannot touch collateral backing a loan",
    "You sign each move, or a session key you capped and can revoke does",
  ],

  async insights(params): Promise<AgentInsights> {
    const [market, radar] = await Promise.all([loadMarket(params), yieldRadar().catch(() => [])]);
    const move = bestMove(market.venues, market.minGainBps);
    const here = radar.find((quote) => quote.symbol === market.symbol);
    const funded = market.venues.filter((venue) => venue.supplied > 0);

    return {
      stats: [
        { label: "Best APY", value: here ? pct(bestApy(here)) : "—", hint: market.symbol },
        {
          label: "Spread",
          value: here && spreadBps(here) !== null ? `${spreadBps(here)} bps` : "—",
          hint: "Aave vs Venus",
        },
        { label: "Assets watched", value: String(radar.length), hint: "listed on both" },
        {
          label: "Your deposit",
          value: funded.length ? funded[0].protocol : "none",
          hint: move ? `move worth ${(move.gainBps / 100).toFixed(2)}%` : "nothing to move",
        },
      ],
      table: {
        title: "Yield radar",
        caption:
          "Live supply APY on both venues for every asset Aave V3 lists on BNB Chain. Rates are compounded from each protocol's own rate unit, not copied from a dashboard.",
        columns: [
          { key: "asset", label: "Asset" },
          { key: "aave", label: "Aave V3", align: "end" },
          { key: "venus", label: "Venus", align: "end" },
          { key: "spread", label: "Spread", align: "end" },
        ],
        rows: radar.map((quote) => ({
          id: quote.asset,
          asset: quote.symbol,
          aave: pct(quote.aaveApy),
          venus: pct(quote.venusApy),
          spread: spreadBps(quote) === null ? "—" : `${spreadBps(quote)} bps`,
        })),
      },
      activity: await recentActivity([
        {
          address: AAVE_POOL,
          kind: "SUPPLY",
          event: parseAbiItem(
            "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
          ),
          describe: (args) => `Deposit into Aave reserve ${String(args.reserve).slice(0, 10)}`,
        },
        {
          address: AAVE_POOL,
          kind: "WITHDRAW",
          event: parseAbiItem(
            "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
          ),
          describe: (args) => `Withdrawal from Aave reserve ${String(args.reserve).slice(0, 10)}`,
        },
      ]).catch(() => []),
    };
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

  async series(params): Promise<AgentSeries | null> {
    const asset = requireAddress(params, "asset");
    const symbol = await bscClient.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "symbol",
    });

    const [aave, venus] = await Promise.all([
      marketId("aave-v3", symbol),
      marketId("venus-core-pool", symbol),
    ]);
    if (!aave || !venus) return null;

    const [aaveHistory, venusHistory] = await Promise.all([apyHistory(aave), apyHistory(venus)]);
    const paired = alignDaily(aaveHistory, venusHistory);
    if (paired.length < 2) return null;

    // The gap is the whole reason to move, so the gap is what gets charted.
    // Above zero means Aave pays more; below zero means Venus does.
    return {
      label: `${symbol} · Aave minus Venus`,
      unit: " bps",
      points: paired.map((day) => ({ t: day.t, v: Math.round((day.a - day.b) * 100) })),
    };
  },

  async scope(params): Promise<SessionScope> {
    const market = await loadMarket(params);
    const calls = [
      { to: AAVE_POOL, label: "Aave V3 pool" },
      { to: market.asset, label: `${market.symbol} token` },
    ];
    if (market.vToken) calls.push({ to: market.vToken, label: `Venus v${market.symbol} market` });

    const funded = market.venues.find((venue) => venue.supplied > 0);
    return {
      calls,
      spend: [
        {
          token: market.asset,
          symbol: market.symbol,
          decimals: market.decimals,
          suggested: funded ? funded.supplied.toPrecision(6) : "0",
        },
      ],
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
