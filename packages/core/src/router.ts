/**
 * Turning a BNB deposit into whatever a strategy actually needs.
 *
 * Every agent here is funded the same way — the user sends BNB and stops
 * thinking about it — but none of them trade BNB. They need WBNB, or USDT, or
 * both sides of a pool. This is the one place that gap is crossed, so the
 * plugins do not each grow their own swap.
 */
import { type Address, encodeFunctionData, type Hex } from "viem";
import { bscClient } from "./chain.ts";
import { tokenSeries } from "./market.ts";
import type { AgentTx } from "./types.ts";

export const WBNB: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
export const SMART_ROUTER: Address = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";

/** Gas has to come from somewhere, so a deposit is never spent to the last wei. */
export const GAS_RESERVE_WEI = 3_000_000_000_000_000n; // 0.003 BNB

const wbnbAbi = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const routerAbi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** Native BNB the wallet can actually commit, once gas is set aside. */
/** BNB in dollars, from the deepest pool it trades in. */
export async function bnbUsd(): Promise<number | null> {
  const last = (await tokenSeries(WBNB, 6)).at(-1)?.v;
  return last && last > 0 ? last : null;
}

export async function spendableBnb(wallet: Address) {
  const balance = await bscClient.getBalance({ address: wallet });
  return balance > GAS_RESERVE_WEI ? balance - GAS_RESERVE_WEI : 0n;
}

export function tokenBalance(token: Address, wallet: Address) {
  return bscClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet],
  });
}

/** BNB is not an ERC20, so nothing can route it until it is wrapped. */
export function wrapBnb(amountWei: bigint): AgentTx {
  return {
    to: WBNB,
    data: encodeFunctionData({ abi: wbnbAbi, functionName: "deposit" }),
    value: amountWei,
  };
}

export function approveTx(token: Address, spender: Address, amount: bigint): AgentTx {
  return {
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
  };
}

/** An approval only when the standing allowance will not cover the spend. */
export async function approveIfShort(
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
): Promise<AgentTx[]> {
  const allowance = await bscClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return allowance >= amount ? [] : [approveTx(token, spender, amount)];
}

export const FACTORY: Address = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

/** PancakeSwap V3 fee tiers, cheapest first. */
export const FEE_TIERS = [100, 500, 2500, 10_000] as const;

const factoryAbi = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

const slot0Abi = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint32" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    name: "token0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The deepest V3 pool for a pair, measured by how much of `tokenA` it holds.
 * A route through a thin pool is a route that gets sandwiched.
 */
export async function bestPool(tokenA: Address, tokenB: Address) {
  const candidates = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      const pool = await bscClient
        .readContract({
          address: FACTORY,
          abi: factoryAbi,
          functionName: "getPool",
          args: [tokenA, tokenB, fee],
        })
        .catch(() => ZERO as Address);
      if (pool === ZERO) return null;
      const depth = await tokenBalance(tokenA, pool).catch(() => 0n);
      return { pool, fee, depth };
    }),
  );

  const usable = candidates.filter((entry) => entry !== null).filter((entry) => entry.depth > 0n);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (b.depth > a.depth ? b : a));
}

const Q192 = 2n ** 192n;

/**
 * What a swap should return, straight from the pool's own price.
 *
 * Working in raw units against sqrtPriceX96 keeps decimals out of it entirely,
 * which is one fewer thing to get wrong on a token that is not 18.
 */
export async function quoteExactIn(pool: Address, tokenIn: Address, amountIn: bigint) {
  const [[sqrtPriceX96], token0] = await Promise.all([
    bscClient.readContract({ address: pool, abi: slot0Abi, functionName: "slot0" }),
    bscClient.readContract({ address: pool, abi: slot0Abi, functionName: "token0" }),
  ]);
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const zeroForOne = tokenIn.toLowerCase() === token0.toLowerCase();
  return zeroForOne ? (amountIn * priceX192) / Q192 : (amountIn * Q192) / priceX192;
}

/** Basis points shaved off a quote before it becomes a floor. */
export const SLIPPAGE_BPS = 100n;

export const withSlippage = (amount: bigint) => (amount * (10_000n - SLIPPAGE_BPS)) / 10_000n;

export type SwapRequest = {
  tokenIn: Address;
  tokenOut: Address;
  /** Pool fee tier in hundredths of a bip, e.g. 500 for a 0.05% pool. */
  fee: number;
  amountIn: bigint;
  /** Floor on what comes back. Never pass zero on a live route. */
  minOut: bigint;
  recipient: Address;
};

export function swapTx(request: SwapRequest): AgentTx {
  return {
    to: SMART_ROUTER,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: request.tokenIn,
          tokenOut: request.tokenOut,
          fee: request.fee,
          recipient: request.recipient,
          amountIn: request.amountIn,
          amountOutMinimum: request.minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    }),
  };
}

/**
 * Wrap, approve and swap a BNB amount into `tokenOut` — the whole bootstrap in
 * one call, skipping any step the wallet has already covered.
 */
export type Bootstrap = {
  txs: AgentTx[];
  /**
   * The floor on what arrives. Later steps size themselves against this rather
   * than the quote: the quote is what should arrive, this is what must.
   */
  minOut: bigint;
};

export async function bnbInto(
  wallet: Address,
  tokenOut: Address,
  amountWei: bigint,
): Promise<Bootstrap> {
  if (amountWei <= 0n) return { txs: [], minOut: 0n };
  // Wrapping is the whole job when the target is WBNB itself.
  if (tokenOut.toLowerCase() === WBNB.toLowerCase()) {
    return { txs: [wrapBnb(amountWei)], minOut: amountWei };
  }

  const route = await bestPool(WBNB, tokenOut);
  if (!route) throw new Error(`no PancakeSwap V3 route from BNB into ${tokenOut}`);

  const minOut = withSlippage(await quoteExactIn(route.pool, WBNB, amountWei));
  return {
    minOut,
    txs: [
      wrapBnb(amountWei),
      ...(await approveIfShort(WBNB, wallet, SMART_ROUTER, amountWei)),
      swapTx({
        tokenIn: WBNB,
        tokenOut,
        fee: route.fee,
        amountIn: amountWei,
        minOut,
        recipient: wallet,
      }),
    ],
  };
}

export type { Hex };
