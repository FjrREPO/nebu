import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentSeries,
  type AgentStatus,
  type AgentTx,
  type AutoParams,
  approveIfShort,
  bnbInto,
  bscClient,
  InvalidParams,
  plainAmount,
  plainNumber,
  poolLink,
  poolSeries,
  recentActivity,
  requireAddress,
  requireInt,
  type SessionScope,
  SMART_ROUTER,
  spendableBnb,
  tokenLogos,
  WBNB,
} from "@nebu/core";
import { type Address, encodeFunctionData, formatUnits, maxUint128, parseAbiItem } from "viem";
import { erc20Abi, POSITION_MANAGER, poolAbi, positionManagerAbi } from "./abi.ts";
import {
  feesEarned,
  formatPrice,
  inRange,
  poolAddress,
  positionsOf,
  priceToTick,
  slot0,
  snapToSpacing,
  tickToPrice,
  tokenMeta,
} from "./pool.ts";
import { compactUsd, livePools, shortlist } from "./pools.ts";

const DEADLINE_SECONDS = 20 * 60;

function tokenId(params: Record<string, string>) {
  const raw = requireInt(params, "tokenId");
  if (raw <= 0) throw new InvalidParams("tokenId must be positive");
  return BigInt(raw);
}

async function loadPosition(id: bigint) {
  const position = await bscClient
    .readContract({
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "positions",
      args: [id],
    })
    .catch(() => {
      throw new InvalidParams(`position #${id} does not exist`);
    });

  const [
    ,
    ,
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    liquidity,
    feeGrowthInside0Last,
    feeGrowthInside1Last,
    owed0,
    owed1,
  ] = position;
  const pool = await poolAddress(token0, token1, fee);
  const onPool = { address: pool, abi: poolAbi } as const;

  const [[, tick], spacing, meta0, meta1, global0, global1, lowerTick, upperTick] =
    await Promise.all([
      slot0(pool),
      bscClient.readContract({ ...onPool, functionName: "tickSpacing" }),
      tokenMeta(token0),
      tokenMeta(token1),
      bscClient.readContract({ ...onPool, functionName: "feeGrowthGlobal0X128" }),
      bscClient.readContract({ ...onPool, functionName: "feeGrowthGlobal1X128" }),
      bscClient.readContract({ ...onPool, functionName: "ticks", args: [tickLower] }),
      bscClient.readContract({ ...onPool, functionName: "ticks", args: [tickUpper] }),
    ]);

  // What the position has made and not yet taken out, one side at a time.
  const earned = (
    globalX128: bigint,
    outsideLower: bigint,
    outsideUpper: bigint,
    insideLast: bigint,
    owed: bigint,
  ) =>
    feesEarned({
      liquidity,
      tickCurrent: tick,
      tickLower,
      tickUpper,
      feeGrowthGlobalX128: globalX128,
      feeGrowthOutsideLowerX128: outsideLower,
      feeGrowthOutsideUpperX128: outsideUpper,
      feeGrowthInsideLastX128: insideLast,
      owed,
    });
  const fees0 = earned(global0, lowerTick[2], upperTick[2], feeGrowthInside0Last, owed0);
  const fees1 = earned(global1, lowerTick[3], upperTick[3], feeGrowthInside1Last, owed1);

  return {
    id,
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    liquidity,
    pool,
    tick,
    spacing,
    meta0,
    meta1,
    fees0,
    fees1,
  };
}

type Position = Awaited<ReturnType<typeof loadPosition>>;

/** Same tick width as before, recentred on where the pool actually trades now. */
export function recentre(position: Pick<Position, "tick" | "tickLower" | "tickUpper" | "spacing">) {
  const halfWidth = Math.round((position.tickUpper - position.tickLower) / 2);
  const centre = snapToSpacing(position.tick, position.spacing);
  return {
    tickLower: snapToSpacing(centre - halfWidth, position.spacing),
    tickUpper: snapToSpacing(centre + halfWidth, position.spacing),
  };
}

function describe(position: Position) {
  const { meta0, meta1 } = position;
  const price = (tick: number) => formatPrice(tickToPrice(tick, meta0.decimals, meta1.decimals));
  return `${meta0.symbol}/${meta1.symbol} at ${price(position.tick)}, range ${price(position.tickLower)}-${price(position.tickUpper)}`;
}

/**
 * What a session needs before it can turn a BNB deposit into a position:
 * the wrapper, the router, both tokens, and native value to wrap.
 */
async function openingScope(params: Record<string, string>): Promise<SessionScope> {
  const pool = requireAddress(params, "pool");
  const wallet = requireAddress(params, "wallet");

  const [token0, token1, budget] = await Promise.all([
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    spendableBnb(wallet),
  ]);
  const [meta0, meta1] = await Promise.all([tokenMeta(token0), tokenMeta(token1)]);

  // Cap each token at what its half of the deposit is expected to buy.
  const half = budget / 2n;
  const [leg0, leg1] = await Promise.all([
    bnbInto(wallet, token0, half).catch(() => null),
    bnbInto(wallet, token1, budget - half).catch(() => null),
  ]);

  return {
    calls: [
      { to: POSITION_MANAGER, label: "PancakeSwap position manager" },
      { to: SMART_ROUTER, label: "PancakeSwap smart router" },
      { to: WBNB, label: "Wrapped BNB" },
      { to: token0, label: `${meta0.symbol} token` },
      { to: token1, label: `${meta1.symbol} token` },
    ],
    spend: [
      {
        token: token0,
        symbol: meta0.symbol,
        decimals: meta0.decimals,
        suggested: plainNumber(Number(formatUnits(leg0?.minOut ?? 0n, meta0.decimals))),
      },
      {
        token: token1,
        symbol: meta1.symbol,
        decimals: meta1.decimals,
        suggested: plainNumber(Number(formatUnits(leg1?.minOut ?? 0n, meta1.decimals))),
      },
    ],
    nativeSpend: plainNumber(Number(formatUnits(budget, 18))),
  };
}

/** Half a position's width either side of spot, in ticks. */
const DEFAULT_HALF_WIDTH = Math.round(Math.log(1.15) / Math.log(1.0001));

/**
 * Turn a BNB deposit into a brand new concentrated position: buy both sides,
 * then mint a range centred on where the pool trades right now.
 *
 * Amounts are sized off each swap's floor rather than its quote, and the mint
 * takes them as `desired` with no minimum — the position manager refunds
 * whatever will not fit the ratio, so a floor here could only cause a revert.
 */
async function openPosition(params: Record<string, string>): Promise<AgentAction | null> {
  const pool = requireAddress(params, "pool");
  const wallet = requireAddress(params, "wallet");

  const budget = await spendableBnb(wallet);
  if (budget <= 0n) return null;

  const [token0, token1, fee, spacing, [, tick]] = await Promise.all([
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "fee" }),
    bscClient.readContract({ address: pool, abi: poolAbi, functionName: "tickSpacing" }),
    slot0(pool),
  ]);
  const [meta0, meta1] = await Promise.all([tokenMeta(token0), tokenMeta(token1)]);

  const half = budget / 2n;
  const [leg0, leg1] = await Promise.all([
    bnbInto(wallet, token0, half),
    bnbInto(wallet, token1, budget - half),
  ]);
  if (leg0.minOut === 0n || leg1.minOut === 0n) return null;

  const tickLower = snapToSpacing(tick - DEFAULT_HALF_WIDTH, spacing);
  const tickUpper = snapToSpacing(tick + DEFAULT_HALF_WIDTH, spacing);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

  const approvals = [
    ...(await approveIfShort(token0, wallet, POSITION_MANAGER, leg0.minOut)),
    ...(await approveIfShort(token1, wallet, POSITION_MANAGER, leg1.minOut)),
  ];

  const price = (value: number) => formatPrice(tickToPrice(value, meta0.decimals, meta1.decimals));
  return {
    reason: `Open a ${meta0.symbol}/${meta1.symbol} position from ${plainAmount(Number(formatUnits(budget, 18)))} BNB, ranged ${price(tickLower)}-${price(tickUpper)} around the live price.`,
    txs: [
      ...leg0.txs,
      ...leg1.txs,
      ...approvals,
      {
        to: POSITION_MANAGER,
        data: encodeFunctionData({
          abi: positionManagerAbi,
          functionName: "mint",
          args: [
            {
              token0,
              token1,
              fee,
              tickLower,
              tickUpper,
              amount0Desired: leg0.minOut,
              amount1Desired: leg1.minOut,
              amount0Min: 0n,
              amount1Min: 0n,
              recipient: wallet,
              deadline,
            },
          ],
        }),
      },
    ],
  };
}

export const pancakeRebalancer: AgentPlugin = {
  id: "pancakeswap-v3-rebalancer",
  name: "PancakeSwap V3 Rebalancer",
  category: "rebalancing",
  protocol: "PancakeSwap V3",
  chainId: 56,
  summary:
    "When you provide two tokens to a trading pool you pick a price range, and you only earn fees while the price stays inside it. This watches that range and moves it back around today's price when the market walks out of it.",
  paramSchema: [{ key: "tokenId", label: "Position NFT id", placeholder: "7366225" }],
  example: { tokenId: "7368737" },
  grants: [
    "Looks at your pool deposit and the market it sits in",
    "Prepares the moves that pull your money out, collect the fees it earned, and put it back around today's price",
    "Nothing moves until you approve it — or until a temporary key you set limits on and can cancel approves it for you",
    "There is no route out to anyone else: your money can only go back into a deposit you own",
  ],

  async insights(params): Promise<AgentInsights> {
    const [position, pools] = await Promise.all([
      loadPosition(tokenId(params)),
      livePools().catch(() => []),
    ]);
    const shortlisted = shortlist(pools);
    const best = shortlisted[0];
    const live = inRange(position.tick, position.tickLower, position.tickUpper);

    return {
      stats: [
        {
          label: "Best fee APR",
          value: best ? `${(best.feeApr * 100).toFixed(1)}%` : "—",
          hint: best ? `${best.pair} ${best.feePercent}%` : undefined,
        },
        { label: "Pools in scope", value: String(shortlisted.length), hint: "of 60 scanned" },
        {
          label: "Your position",
          value: position.liquidity === 0n ? "Closed" : live ? "In range" : "Out of range",
          hint: `#${position.id}`,
        },
        {
          label: "Fees earned",
          value: `${formatUnits(position.fees0, position.meta0.decimals).slice(0, 9)} ${position.meta0.symbol}`,
          hint: `+ ${formatUnits(position.fees1, position.meta1.decimals).slice(0, 9)} ${position.meta1.symbol}`,
        },
      ],
      table: {
        title: "LP pools",
        sparkLabel: "24h",
        caption:
          "Pools clearing the agent's floor: $250k deposited, $100k traded a day, a swap every three minutes, open at least a week. A high fee APR is not free money — the busiest pools move enough that a supplier loses more to price drift than the fees pay back.",
        columns: [
          { key: "pair", label: "Pool" },
          { key: "apr", label: "Fee APR", align: "end" },
          { key: "volume", label: "Vol 24h", align: "end" },
          { key: "swaps", label: "Swaps/h", align: "end" },
        ],
        rows: shortlisted.slice(0, 12).map((pool) => ({
          id: pool.address,
          href: poolLink(pool.address),
          pair: `${pool.pair} ${pool.feePercent}%`,
          logo: pool.base.logo ?? "",
          logoAlt: pool.quote.logo ?? "",
          apr: `${(pool.feeApr * 100).toFixed(1)}%`,
          volume: `$${compactUsd(pool.volume24hUsd)}`,
          swaps: pool.swapsPerHour.toLocaleString("en-US"),
          spark: pool.spark,
        })),
      },
      activity: await recentActivity([
        {
          address: POSITION_MANAGER,
          kind: "EXIT-LP",
          event: parseAbiItem(
            "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
          ),
          describe: (args) => `Position #${args.tokenId} pulled liquidity out of its range`,
        },
        {
          address: POSITION_MANAGER,
          kind: "ADD-LP",
          event: parseAbiItem(
            "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
          ),
          describe: (args) => `Position #${args.tokenId} added liquidity`,
        },
      ]).catch(() => []),
    };
  },

  async status(params): Promise<AgentStatus> {
    // No position yet, but a pool chosen and a wallet funded: that is an
    // opening waiting to happen, not an idle agent.
    if (!params.tokenId && params.pool) {
      const wallet = requireAddress(params, "wallet");
      const idle = await spendableBnb(wallet).catch(() => 0n);
      return {
        headline:
          idle > 0n
            ? `Ready to open with ${Number(formatUnits(idle, 18)).toFixed(4)} BNB`
            : "Waiting for a deposit",
        detail:
          "No position yet — the agent will buy both sides and mint a range around the live price.",
        actionable: idle > 0n,
      };
    }

    const position = await loadPosition(tokenId(params));
    const live = inRange(position.tick, position.tickLower, position.tickUpper);

    // A closed position is out of range too, and reporting it that way reads
    // as a problem the agent is refusing to fix. There is nothing in it.
    if (position.liquidity === 0n) {
      return {
        headline: "Position is closed",
        detail: `${describe(position)} — no liquidity left to recentre`,
        actionable: false,
      };
    }

    return {
      headline: live ? "In range, earning fees" : "Out of range, earning nothing",
      detail: describe(position),
      actionable: !live,
    };
  },

  async autoParams(wallet): Promise<AutoParams | null> {
    const [held, pools] = await Promise.all([
      positionsOf(POSITION_MANAGER, wallet).catch(() => []),
      livePools().catch(() => []),
    ]);

    // Already an LP: watch the newest position, no questions asked.
    if (held.length > 0) {
      return {
        params: { tokenId: held[0] },
        reason: `Watching position #${held[0]}, the newest of ${held.length} this wallet holds`,
      };
    }

    // Nothing to watch yet, but the screen still has an opinion about where to
    // put liquidity, so say which pool and why.
    const best = shortlist(pools)[0];
    if (!best) return null;
    return {
      params: { pool: best.address, wallet },
      reason: `No position yet. Opening in ${best.pair} ${best.feePercent}%, the best on the screen at ${(best.feeApr * 100).toFixed(0)}% fee APR`,
    };
  },

  async series(params): Promise<AgentSeries | null> {
    const position = await loadPosition(tokenId(params));
    const prices = await poolSeries(position.pool, 48, position.token0);
    if (prices.length < 2) return null;

    // 0% sits on the lower tick, 100% on the upper: leaving that band is the
    // moment the position stopped earning. That is the agent's whole job.
    const width = position.tickUpper - position.tickLower;
    if (width <= 0) return null;
    const points = prices.map((point) => ({
      t: point.t,
      v:
        ((priceToTick(point.v, position.meta0.decimals, position.meta1.decimals) -
          position.tickLower) /
          width) *
        100,
    }));

    const icons = await tokenLogos([position.token0, position.token1]).catch(() => new Map());
    return {
      label: `${position.meta0.symbol}/${position.meta1.symbol} · position in its range`,
      unit: "%",
      points,
      band: { from: 0, to: 100 },
      logos: [position.token0, position.token1]
        .map((token) => icons.get(token.toLowerCase()))
        .filter((url) => url !== undefined),
    };
  },

  async scope(params): Promise<SessionScope> {
    // A fresh deposit has no position yet, so the grant has to cover the
    // opening move — wrap, swap, mint — not just a rebalance.
    if (!params.tokenId && params.pool) return openingScope(params);

    const position = await loadPosition(tokenId(params));
    return {
      calls: [
        { to: POSITION_MANAGER, label: "PancakeSwap position manager" },
        { to: position.token0, label: `${position.meta0.symbol} token` },
        { to: position.token1, label: `${position.meta1.symbol} token` },
      ],
      spend: [
        {
          token: position.token0,
          symbol: position.meta0.symbol,
          decimals: position.meta0.decimals,
          suggested: "0",
        },
        {
          token: position.token1,
          symbol: position.meta1.symbol,
          decimals: position.meta1.decimals,
          suggested: "0",
        },
      ],
    };
  },

  async plan(params): Promise<AgentAction | null> {
    if (!params.tokenId && params.pool) return openPosition(params);

    const position = await loadPosition(tokenId(params));
    if (inRange(position.tick, position.tickLower, position.tickUpper)) return null;
    if (position.liquidity === 0n) return null;

    const owner = await bscClient.readContract({
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "ownerOf",
      args: [position.id],
    });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    // Ask the chain what the exit actually returns rather than estimating it.
    const { result: withdrawn } = await bscClient.simulateContract({
      account: owner,
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: position.id,
          liquidity: position.liquidity,
          amount0Min: 0n,
          amount1Min: 0n,
          deadline,
        },
      ],
    });
    const [amount0, amount1] = withdrawn;

    const exit = encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({
            abi: positionManagerAbi,
            functionName: "decreaseLiquidity",
            args: [
              {
                tokenId: position.id,
                liquidity: position.liquidity,
                amount0Min: 0n,
                amount1Min: 0n,
                deadline,
              },
            ],
          }),
          encodeFunctionData({
            abi: positionManagerAbi,
            functionName: "collect",
            args: [
              {
                tokenId: position.id,
                recipient: owner,
                amount0Max: maxUint128,
                amount1Max: maxUint128,
              },
            ],
          }),
        ],
      ],
    });

    const range = recentre(position);
    const txs: AgentTx[] = [{ to: POSITION_MANAGER, data: exit }];

    for (const [token, amount] of [
      [position.token0, amount0],
      [position.token1, amount1],
    ] as const) {
      if (amount === 0n) continue;
      const allowance = await bscClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, POSITION_MANAGER],
      });
      if (allowance >= amount) continue;
      // Approve the exact amount this rebalance needs, never an unlimited allowance.
      txs.push({
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [POSITION_MANAGER, amount],
        }),
      });
    }

    txs.push({
      to: POSITION_MANAGER,
      data: encodeFunctionData({
        abi: positionManagerAbi,
        functionName: "mint",
        args: [
          {
            token0: position.token0,
            token1: position.token1,
            fee: position.fee,
            tickLower: range.tickLower,
            tickUpper: range.tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            // ponytail: desired is already the cap and the router refunds the
            // remainder, so a zero floor cannot overspend — it only lets the
            // mint through when the pool ratio shifted between plan and signing.
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: owner as Address,
            deadline,
          },
        ],
      }),
    });

    const price = (tick: number) =>
      formatPrice(tickToPrice(tick, position.meta0.decimals, position.meta1.decimals));
    return {
      reason: `Exit the stale ${price(position.tickLower)}-${price(position.tickUpper)} range, collect fees, and remint at ${price(range.tickLower)}-${price(range.tickUpper)} around the live price.`,
      txs,
    };
  },
};
