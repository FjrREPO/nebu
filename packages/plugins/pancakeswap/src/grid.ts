import {
  type AgentAction,
  type AgentPlugin,
  type AgentStatus,
  bscClient,
  InvalidParams,
  requireAddress,
  requireInt,
  requireNumber,
} from "@nebu/core";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";
import { erc20Abi, poolAbi, SMART_ROUTER, smartRouterAbi } from "./abi.ts";
import { formatPrice, slot0, tickToPrice, tokenMeta } from "./pool.ts";

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
    "Runs a geometric buy-low/sell-high ladder over a price range, swapping only when the wallet drifts a full grid cell away from where the ladder says it should sit.",
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

  async status(params): Promise<AgentStatus> {
    const market = await loadMarket(params);
    const off = drift(market);
    const outside = market.price < market.lower || market.price > market.upper;
    const side = off > 0 ? "sell" : "buy";

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

  async plan(params): Promise<AgentAction | null> {
    const market = await loadMarket(params);
    const off = drift(market);
    if (market.price < market.lower || market.price > market.upper) return null;
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
      reason: `${sellingBase ? "Sell" : "Buy"} ${amountInFloat.toPrecision(6)} ${tokenIn.symbol} to bring the wallet back to the ladder's ${(market.target * 100).toFixed(1)}% ${market.meta1.symbol} target.`,
      txs,
    };
  },
};
