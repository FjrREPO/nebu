import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentSeries,
  type AgentStatus,
  type AutoParams,
  bnbInto,
  bscClient,
  InvalidParams,
  plainAmount,
  plainNumber,
  poolSeries,
  recentActivity,
  requireAddress,
  requireInt,
  requireNumber,
  type SessionScope,
  spendableBnb,
  tokenLogos,
  WBNB,
} from "@nebu/core";
import { encodeFunctionData, formatUnits, parseAbiItem, parseUnits } from "viem";
import { erc20Abi, poolAbi, SMART_ROUTER, smartRouterAbi } from "./abi.ts";
import { formatPrice, slot0, tickToPrice, tokenMeta } from "./pool.ts";
import { livePools, shortlist } from "./pools.ts";

const SLIPPAGE = 0.01;

/**
 * A grid ladder is an inventory rule: all base at the bottom of the range, all
 * quote at the top, stepping across in `grids` cells. Selling into strength and
 * buying into weakness falls out of holding that ratio.
 */
export function targetQuoteShare(price: number, lower: number, upper: number, grids: number) {
  const span = Math.log(upper) - Math.log(lower);
  const position = (Math.log(price) - Math.log(lower)) / span;
  const cell = Math.min(grids - 1, Math.max(0, Math.floor(position * grids)));
  return (cell + 0.5) / grids;
}

/** Grid lines are geometric, so every cell is the same percentage move. */
export function gridLines(lower: number, upper: number, grids: number) {
  const step = (upper / lower) ** (1 / grids);
  return Array.from({ length: grids + 1 }, (_, i) => lower * step ** i);
}

function readGrid(params: Record<string, string>) {
  const lower = requireNumber(params, "lowerPrice");
  const upper = requireNumber(params, "upperPrice");
  const grids = requireInt(params, "grids");
  if (!(lower > 0)) throw new InvalidParams("lowerPrice must be above zero");
  if (upper <= lower) throw new InvalidParams("upperPrice must be above lowerPrice");
  if (grids < 2 || grids > 200) throw new InvalidParams("grids must be between 2 and 200");
  return { lower, upper, grids };
}

async function loadMarket(params: Record<string, string>) {
  const pool = requireAddress(params, "pool");
  const wallet = requireAddress(params, "wallet");
  const { lower, upper, grids } = readGrid(params);

  const [[, tick], token0, token1, fee] = await Promise.all([
    slot0(pool),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "fee" }),
  ]);
  const [meta0, meta1] = await Promise.all([tokenMeta(token0), tokenMeta(token1)]);
  const [balance0, balance1] = await Promise.all([
    bscClient.readContract({
      address: token0,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
    bscClient.readContract({
      address: token1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
  ]);

  const price = tickToPrice(tick, meta0.decimals, meta1.decimals);
  const base = Number(formatUnits(balance0, meta0.decimals));
  const quote = Number(formatUnits(balance1, meta1.decimals));
  const total = base * price + quote;

  return {
    wallet,
    fee,
    meta0,
    meta1,
    price,
    base,
    quote,
    total,
    lower,
    upper,
    grids,
    target: targetQuoteShare(price, lower, upper, grids),
    held: total === 0 ? 0 : quote / total,
  };
}

type Market = Awaited<ReturnType<typeof loadMarket>>;

/** Half a cell of drift is noise; a full cell is a fill the grid should have taken. */
function drift(market: Market) {
  return market.target - market.held;
}

function tolerance(market: Market) {
  return 0.5 / market.grids;
}

export const pancakeGrid: AgentPlugin = {
  id: "pancakeswap-grid-trader",
  name: "PancakeSwap Grid Trader",
  category: "grid",
  protocol: "PancakeSwap V3",
  chainId: 56,
  summary:
    "Buys a little more when the price falls and sells a little when it rises, across a range you choose. It only trades once the price has moved far enough to be worth the fee.",
  paramSchema: [
    {
      key: "pool",
      label: "Pool address",
      placeholder: "0x36696169C63e42cd08ce11f5deeBbCeBae652050",
    },
    { key: "wallet", label: "Wallet", placeholder: "0x..." },
    { key: "lowerPrice", label: "Lower price", placeholder: "0.0012" },
    { key: "upperPrice", label: "Upper price", placeholder: "0.0016" },
    { key: "grids", label: "Grid lines", placeholder: "10" },
  ],
  example: {
    pool: "0x36696169C63e42cd08ce11f5deeBbCeBae652050",
    wallet: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
    lowerPrice: "0.001",
    upperPrice: "0.002",
    grids: "10",
  },
  grants: [
    "Looks at the current price and how much of each token you hold",
    "Only ever trades those two tokens, in the market you picked",
    "Gives permission for the exact amount of each trade — never an open-ended one",
    "Nothing trades until you approve it — or until a temporary key you set limits on and can cancel approves it for you",
    "Every trade has a floor: if you would get more than 1% less than quoted, it does not go through",
  ],

  async insights(params): Promise<AgentInsights> {
    const market = await loadMarket(params);
    const lines = gridLines(market.lower, market.upper, market.grids);
    const step = (market.upper / market.lower) ** (1 / market.grids) - 1;
    const off = drift(market);

    return {
      stats: [
        {
          label: "Spot",
          value: formatPrice(market.price),
          hint: `${market.meta0.symbol}/${market.meta1.symbol}`,
        },
        {
          label: "Cell width",
          value: `${(step * 100).toFixed(2)}%`,
          hint: `${market.grids} cells`,
        },
        {
          label: "Ladder target",
          value: `${(market.target * 100).toFixed(1)}%`,
          hint: `${market.meta1.symbol} share`,
        },
        {
          label: "Drift",
          value: `${(off * 100).toFixed(1)}%`,
          hint: Math.abs(off) > tolerance(market) ? "past the trigger" : "inside tolerance",
        },
      ],
      table: {
        title: "Ladder",
        caption:
          "Geometric grid lines across your range. The agent trades the line the price crosses, holding more quote as it climbs.",
        columns: [
          { key: "level", label: "Line" },
          { key: "price", label: "Price", align: "end" },
          { key: "side", label: "Side", align: "end" },
          { key: "distance", label: "From spot", align: "end" },
        ],
        rows: lines.map((line, index) => ({
          id: `line-${index}`,
          level: String(index).padStart(2, "0"),
          price: formatPrice(line),
          side: line < market.price ? "buy" : "sell",
          distance: `${(((line - market.price) / market.price) * 100).toFixed(2)}%`,
        })),
      },
      activity: await recentActivity([
        {
          address: requireAddress(params, "pool"),
          kind: "SWAP",
          event: parseAbiItem(
            "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
          ),
          describe: (args) => {
            const amount0 = args.amount0 as bigint;
            const bought = amount0 < 0n;
            const size = Number(
              formatUnits(amount0 < 0n ? -amount0 : amount0, market.meta0.decimals),
            );
            return `${bought ? "Bought" : "Sold"} ${plainAmount(size)} ${market.meta0.symbol} at tick ${args.tick}`;
          },
        },
      ]).catch(() => []),
    };
  },

  async status(params): Promise<AgentStatus> {
    const market = await loadMarket(params);
    const off = drift(market);
    const outside = market.price < market.lower || market.price > market.upper;
    const side = off > 0 ? "sell" : "buy";
    // An empty wallet holding BNB has not failed, it just has not started.
    const idle = market.total === 0 ? await spendableBnb(market.wallet).catch(() => 0n) : 0n;

    if (idle > 0n && !outside) {
      return {
        headline: `Ready to deploy ${Number(formatUnits(idle, 18)).toFixed(4)} BNB`,
        detail: `${market.meta0.symbol}/${market.meta1.symbol} ladder wants ${(market.target * 100).toFixed(1)}% ${market.meta1.symbol} to start`,
        actionable: true,
      };
    }

    return {
      headline: outside
        ? "Price left the grid"
        : Math.abs(off) > tolerance(market)
          ? `Grid says ${side}`
          : "Balanced",
      detail: `${market.meta0.symbol}/${market.meta1.symbol} at ${formatPrice(market.price)} · holding ${(market.held * 100).toFixed(1)}% ${market.meta1.symbol}, ladder wants ${(market.target * 100).toFixed(1)}%`,
      actionable: !outside && Math.abs(off) > tolerance(market) && market.total > 0,
    };
  },

  async autoParams(wallet): Promise<AutoParams | null> {
    const best = shortlist(await livePools().catch(() => []))[0];
    if (!best) return null;

    // Size the range from what the pair has actually done over two days, not
    // from a number picked out of the air. A quiet pair gets a tight ladder.
    //
    // Priced in the pool's own units: loadMarket derives its price from the
    // tick, and a range quoted in USD would put the ladder nowhere near it.
    const token0 = await bscClient.readContract({
      address: best.address as `0x${string}`,
      abi: poolAbi,
      functionName: "token0",
    });
    const history = await poolSeries(best.address, 48, token0);
    const prices = history.map((point) => point.v).filter((value) => value > 0);

    // The chart feed is a throttled free tier. Losing it should cost the agent
    // its measured range, not its ability to work — fall back to the live tick
    // and a default band, and say which one this is.
    const token1 = await bscClient.readContract({
      address: best.address as `0x${string}`,
      abi: poolAbi,
      functionName: "token1",
    });
    const [meta0, meta1] = await Promise.all([tokenMeta(token0), tokenMeta(token1)]);
    const [, tick] = await slot0(best.address as `0x${string}`);
    const spot = prices.at(-1) ?? tickToPrice(tick, meta0.decimals, meta1.decimals);
    if (!(spot > 0)) return null;

    const measured = prices.length >= 2;
    const swing = measured
      ? Math.max(0.05, Math.min(0.5, (Math.max(...prices) - Math.min(...prices)) / spot))
      : 0.15;

    return {
      params: {
        pool: best.address,
        wallet,
        // Twelve decimal places rounds anything under 5e-13 to "0", and the
        // agent would then hand itself a range its own validation rejects.
        // Significant figures keep a small price small instead of losing it.
        lowerPrice: formatPrice(spot * (1 - swing)),
        upperPrice: formatPrice(spot * (1 + swing)),
        grids: "10",
      },
      reason: measured
        ? `${best.pair} ${best.feePercent}% moved ${(swing * 100).toFixed(1)}% in 48h, so the ladder spans that either side of spot`
        : `${best.pair} ${best.feePercent}% picked on fee APR; no price history right now, so the ladder uses a default ${(swing * 100).toFixed(0)}% band`,
    };
  },

  async series(params): Promise<AgentSeries | null> {
    const pool = requireAddress(params, "pool");
    const { lower, upper, grids } = readGrid(params);
    const market = await loadMarket(params);
    const prices = await poolSeries(pool, 48, market.meta0.address);
    if (prices.length < 2) return null;

    // The ladder's own rule, run over the last two days: how much quote it
    // wanted to be holding at each hour.
    const icons = await tokenLogos([market.meta0.address, market.meta1.address]);
    return {
      label: `${market.meta0.symbol}/${market.meta1.symbol} · ladder target`,
      unit: "%",
      points: prices.map((point) => ({
        t: point.t,
        v: targetQuoteShare(point.v, lower, upper, grids) * 100,
      })),
      logos: [market.meta0.address, market.meta1.address]
        .map((token) => icons.get(token.toLowerCase()))
        .filter((url) => url !== undefined),
    };
  },

  async scope(params): Promise<SessionScope> {
    const market = await loadMarket(params);
    const budget = await spendableBnb(market.wallet).catch(() => 0n);

    return {
      calls: [
        { to: SMART_ROUTER, label: "PancakeSwap smart router" },
        // Wrapping is how a BNB deposit becomes something the router can move.
        { to: WBNB, label: "Wrapped BNB" },
        { to: market.meta0.address, label: `${market.meta0.symbol} token` },
        { to: market.meta1.address, label: `${market.meta1.symbol} token` },
      ],
      nativeSpend: plainNumber(Number(formatUnits(budget, 18))),
      spend: [
        {
          token: market.meta0.address,
          symbol: market.meta0.symbol,
          decimals: market.meta0.decimals,
          suggested: plainNumber(market.total / market.price / market.grids),
        },
        {
          token: market.meta1.address,
          symbol: market.meta1.symbol,
          decimals: market.meta1.decimals,
          suggested: plainNumber(market.total / market.grids),
        },
      ],
    };
  },

  async plan(params): Promise<AgentAction | null> {
    const market = await loadMarket(params);
    const off = drift(market);
    if (market.price < market.lower || market.price > market.upper) return null;

    // Fresh deposit: buy into both sides at the ratio the ladder wants, then
    // every run after this is an ordinary rebalance.
    if (market.total === 0) {
      const budget = await spendableBnb(market.wallet);
      if (budget <= 0n) return null;

      const toQuote = (budget * BigInt(Math.round(market.target * 10_000))) / 10_000n;
      const [quoteLeg, baseLeg] = await Promise.all([
        bnbInto(market.wallet, market.meta1.address, toQuote),
        bnbInto(market.wallet, market.meta0.address, budget - toQuote),
      ]);
      const txs = [...quoteLeg.txs, ...baseLeg.txs];
      if (txs.length === 0) return null;

      return {
        reason: `Split ${plainAmount(Number(formatUnits(budget, 18)))} BNB into ${(market.target * 100).toFixed(1)}% ${market.meta1.symbol} and ${((1 - market.target) * 100).toFixed(1)}% ${market.meta0.symbol}, where the ladder starts.`,
        txs,
      };
    }
    if (Math.abs(off) <= tolerance(market) || market.total === 0) return null;

    const sellingBase = off > 0;
    const tokenIn = sellingBase ? market.meta0 : market.meta1;
    const tokenOut = sellingBase ? market.meta1 : market.meta0;
    // Move exactly the drift, valued in the token being spent.
    const valueToMove = Math.abs(off) * market.total;
    const amountInFloat = sellingBase ? valueToMove / market.price : valueToMove;
    const available = sellingBase ? market.base : market.quote;
    if (amountInFloat > available)
      throw new InvalidParams("wallet balance moved since the last read");

    const amountIn = parseUnits(amountInFloat.toFixed(tokenIn.decimals), tokenIn.decimals);
    if (amountIn === 0n) return null;

    const expectedOut = sellingBase ? valueToMove : valueToMove / market.price;
    const minOut = parseUnits(
      (expectedOut * (1 - SLIPPAGE)).toFixed(tokenOut.decimals),
      tokenOut.decimals,
    );

    const allowance = await bscClient.readContract({
      address: tokenIn.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [market.wallet, SMART_ROUTER],
    });

    const txs = [];
    if (allowance < amountIn) {
      txs.push({
        to: tokenIn.address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SMART_ROUTER, amountIn],
        }),
      });
    }
    txs.push({
      to: SMART_ROUTER,
      data: encodeFunctionData({
        abi: smartRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: market.fee,
            recipient: market.wallet,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
    });

    return {
      reason: `${sellingBase ? "Sell" : "Buy"} ${plainAmount(amountInFloat)} ${tokenIn.symbol} to bring the wallet back to the ladder's ${(market.target * 100).toFixed(1)}% ${market.meta1.symbol} target.`,
      txs,
    };
  },
};
