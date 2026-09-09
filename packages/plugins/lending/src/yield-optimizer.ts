import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentSeries,
  type AgentStatus,
  type AgentTx,
  type AutoParams,
  alignDaily,
  apyHistory,
  bnbInto,
  bscClient,
  InvalidParams,
  marketId,
  plainAmount,
  plainNumber,
  recentActivity,
  requireAddress,
  requireInt,
  type SessionScope,
  SMART_ROUTER,
  sparkOf,
  spendableBnb,
  tokenLink,
  tokenLogos,
  WBNB,
} from "@nebu/core";
import { type Address, encodeFunctionData, formatUnits, parseAbiItem, parseUnits } from "viem";
import { AAVE_POOL, erc20Abi, liquidityRateToApy, poolAbi, reserveData } from "./aave.ts";
import { bestApy, pct, spreadBps, used, type VenueQuote, yieldRadar } from "./radar.ts";
import { bestMove, CROWDED, type Venue } from "./venue.ts";
import { supplyRateToApy, underlyingBalance, venusMarketFor, vTokenAbi } from "./venus.ts";

const DEFAULT_MIN_GAIN_BPS = 25;

/** How full the venue we are naming is, as a percentage, when it is known. */
function crowding(quote: VenueQuote, venue: string) {
  const usedHere = venue === "Aave V3" ? quote.aaveUsed : quote.venusUsed;
  return usedHere !== null && usedHere >= CROWDED ? `${(usedHere * 100).toFixed(0)}%` : null;
}

async function loadMarket(params: Record<string, string>) {
  const asset = requireAddress(params, "asset");
  const wallet = requireAddress(params, "wallet");
  const minGainBps = params.minGainBps ? requireInt(params, "minGainBps") : DEFAULT_MIN_GAIN_BPS;
  if (minGainBps < 0) throw new InvalidParams("minGainBps cannot be negative");

  // An address that is not a token answers "0x" to both of these, which
  // surfaced as a 502 quoting a viem error. Handing us the wrong address is
  // the caller's mistake, not the chain having a bad day — and the guard has
  // to cover both reads, since Promise.all rejects on whichever loses.
  const [[symbol, decimals], reserve, vToken] = await Promise.all([
    Promise.all([
      bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
      bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
    ]).catch(() => {
      throw new InvalidParams(`${asset} is not a token on BNB Smart Chain`);
    }),
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
    // What is lent out already decides how easily this comes back.
    const [supply, debt] = await Promise.all([
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
    ]);
    venues.push({
      protocol: "Aave V3",
      apy: liquidityRateToApy(reserve.currentLiquidityRate),
      supplied: Number(formatUnits(aTokenBalance, decimals)),
      used: supply !== null && debt !== null ? used(debt, supply) : null,
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
    const [cash, borrows, reserves] = await Promise.all([
      bscClient
        .readContract({ address: vToken, abi: vTokenAbi, functionName: "getCash" })
        .catch(() => null),
      bscClient
        .readContract({ address: vToken, abi: vTokenAbi, functionName: "totalBorrows" })
        .catch(() => null),
      bscClient
        .readContract({ address: vToken, abi: vTokenAbi, functionName: "totalReserves" })
        .catch(() => null),
    ]);
    venues.push({
      protocol: "Venus",
      apy: await supplyRateToApy(rate),
      supplied: Number(formatUnits(underlyingBalance(balance, exchangeRate), decimals)),
      used:
        cash !== null && borrows !== null && reserves !== null
          ? used(borrows, cash + borrows - reserves)
          : null,
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
    "Two lending apps pay interest on the same coin, and the better rate changes. This checks both and moves your deposit to whichever pays more, once the gain is worth the fees.",
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
    "Checks what both lenders are paying and where your deposit is now",
    "Can only take out the coin you named, and only to your own wallet",
    "Gives permission for exactly the amount being moved, nothing more",
    "Cannot borrow, and cannot touch anything backing a loan",
    "Nothing moves until you approve it — or until a temporary key you set limits on and can cancel approves it for you",
  ],

  async insights(params): Promise<AgentInsights> {
    const [market, radar] = await Promise.all([loadMarket(params), yieldRadar().catch(() => [])]);
    const icons = await tokenLogos(radar.map((quote) => quote.asset)).catch(() => new Map());
    const radarIcons = radar.map((quote) => ({
      ...quote,
      logo: icons.get(quote.asset.toLowerCase()),
    }));
    // The venue actually paying more is the one whose rate history matters.
    const sparks = await Promise.all(
      radarIcons.map(async (quote) => {
        const better =
          (quote.aaveApy ?? 0) >= (quote.venusApy ?? 0) ? "aave-v3" : "venus-core-pool";
        const id = await marketId(better, quote.symbol);
        return id ? sparkOf(await apyHistory(id)) : "";
      }),
    );
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
        sparkLabel: "30d",
        caption:
          "Live supply APY on both venues for every asset Aave V3 lists on BNB Chain. Rates are compounded from each protocol's own rate unit, not copied from a dashboard.",
        columns: [
          { key: "asset", label: "Asset" },
          { key: "aave", label: "Aave V3", align: "end" },
          { key: "venus", label: "Venus", align: "end" },
          { key: "spread", label: "Spread", align: "end" },
          { key: "used", label: "Lent out", align: "end" },
        ],
        rows: radarIcons.map((quote, index) => ({
          id: quote.asset,
          href: tokenLink(quote.asset),
          asset: quote.symbol,
          logo: quote.logo ?? "",
          aave: pct(quote.aaveApy),
          venus: pct(quote.venusApy),
          spread: spreadBps(quote) === null ? "—" : `${spreadBps(quote)} bps`,
          used: (() => {
            // Of whichever venue pays more: that is the one worth moving into,
            // and the one you might struggle to leave.
            const better =
              (quote.aaveApy ?? 0) >= (quote.venusApy ?? 0) ? quote.aaveUsed : quote.venusUsed;
            return better === null ? "—" : `${(better * 100).toFixed(0)}%`;
          })(),
          spark: sparks[index],
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
    const idle = await spendableBnb(market.wallet).catch(() => 0n);
    const quotes = market.venues
      .map((venue) => `${venue.protocol} ${(venue.apy * 100).toFixed(2)}%`)
      .join(" vs ");
    const move = bestMove(market.venues, market.minGainBps);
    const funded = market.venues.filter((venue) => venue.supplied > 0);

    // A funded wallet with nothing deployed is work waiting, not a quiet state.
    const deployable = funded.length === 0 && idle > 0n;
    const best = market.venues.reduce((a, b) => (b.apy > a.apy ? b : a));

    return {
      headline: move
        ? `Move to ${move.to.protocol} for +${(move.gainBps / 100).toFixed(2)}%`
        : deployable
          ? `Ready to deploy ${Number(formatUnits(idle, 18)).toFixed(4)} BNB`
          : funded.length > 0
            ? "Already in the best venue"
            : "Waiting for a deposit",
      detail: deployable
        ? `${market.symbol} pays ${(best.apy * 100).toFixed(2)}% on ${best.protocol} — ${quotes}`
        : `${market.symbol}: ${quotes}${funded.length ? ` · holding ${plainAmount(funded[0].supplied)} on ${funded[0].protocol}` : ""}`,
      actionable: move !== null || deployable,
    };
  },

  async autoParams(wallet): Promise<AutoParams | null> {
    const radar = await yieldRadar().catch(() => []);
    const best = radar[0];
    if (!best) return null;

    // The radar is already ranked, so the agent's own screen picks the asset.
    const venue = (best.aaveApy ?? 0) >= (best.venusApy ?? 0) ? "Aave V3" : "Venus";
    return {
      params: { asset: best.asset, wallet, minGainBps: "25" },
      // A rate that high is usually a market that full, and saying the first
      // without the second is how someone ends up unable to get their money.
      reason: `${best.symbol} pays ${pct(bestApy(best))} on ${venue}, the best of ${radar.length} assets listed on both${
        crowding(best, venue) ? ` — though ${crowding(best, venue)} of it is lent out` : ""
      }`,
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
    const icons = await tokenLogos([asset]);
    return {
      label: `${symbol} · Aave minus Venus`,
      unit: " bps",
      points: paired.map((day) => ({ t: day.t, v: Math.round((day.a - day.b) * 100) })),
      logos: [icons.get(asset.toLowerCase())].filter((url) => url !== undefined),
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
    const budget = await spendableBnb(market.wallet).catch(() => 0n);

    // A fresh deposit is wrapped and swapped before anything is supplied.
    calls.push(
      { to: SMART_ROUTER, label: "PancakeSwap smart router" },
      { to: WBNB, label: "Wrapped BNB" },
    );

    return {
      calls,
      nativeSpend: plainNumber(Number(formatUnits(budget, 18))),
      spend: [
        {
          token: market.asset,
          symbol: market.symbol,
          decimals: market.decimals,
          // Already supplied: cap at what would move. Fresh deposit: cap at
          // what the swap is expected to buy, or the supply step reverts on a
          // zero allowance.
          suggested: funded
            ? plainNumber(funded.supplied)
            : plainNumber(
                Number(
                  formatUnits(
                    (await bnbInto(market.wallet, market.asset, budget).catch(() => null))
                      ?.minOut ?? 0n,
                    market.decimals,
                  ),
                ),
              ),
        },
      ],
    };
  },

  async plan(params): Promise<AgentAction | null> {
    const market = await loadMarket(params);

    // Nothing supplied anywhere yet: this is a fresh BNB deposit, so turn it
    // into the asset and put it to work rather than reporting no-op forever.
    if (market.venues.every((venue) => venue.supplied === 0)) {
      const budget = await spendableBnb(market.wallet);
      if (budget <= 0n) return null;

      const best = market.venues.reduce((a, b) => (b.apy > a.apy ? b : a));
      const bootstrap = await bnbInto(market.wallet, market.asset, budget);
      if (bootstrap.minOut === 0n) return null;

      // Size the deposit off the swap's floor, not its quote: the floor is the
      // amount that is guaranteed to be there when the next call runs.
      return {
        reason: `Turn ${plainAmount(Number(formatUnits(budget, 18)))} BNB into ${market.symbol} and supply it to ${best.protocol} at ${(best.apy * 100).toFixed(2)}%.`,
        txs: [...bootstrap.txs, ...depositTxs(market, best.protocol, bootstrap.minOut)],
      };
    }

    const move = bestMove(market.venues, market.minGainBps);
    if (!move) return null;

    const amount = parseUnits(move.from.supplied.toFixed(market.decimals), market.decimals);
    if (amount === 0n) return null;

    return {
      reason: `Move ${plainAmount(move.from.supplied)} ${market.symbol} from ${move.from.protocol} (${(move.from.apy * 100).toFixed(2)}%) to ${move.to.protocol} (${(move.to.apy * 100).toFixed(2)}%), worth ${(move.gainBps / 100).toFixed(2)}% a year.`,
      txs: [
        withdrawTx(market, move.from.protocol, amount),
        ...depositTxs(market, move.to.protocol, amount),
      ],
    };
  },
};
