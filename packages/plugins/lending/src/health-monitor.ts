import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentSeries,
  type AgentStatus,
  type AgentTx,
  type AutoParams,
  bscClient,
  dailyVolatility,
  daysToMove,
  explorerLink,
  InvalidParams,
  LOG_SPAN,
  plainAmount,
  plainNumber,
  recentActivity,
  requireAddress,
  requireNumber,
  type SessionScope,
  tokenLogos,
  tokenSeries,
} from "@nebu/core";
import {
  type Address,
  encodeFunctionData,
  formatUnits,
  maxUint256,
  parseAbiItem,
  parseUnits,
} from "viem";
import {
  AAVE_POOL,
  assetPrice,
  BASE_DECIMALS,
  erc20Abi,
  poolAbi,
  reserveData,
  reservesList,
  userAccountData,
} from "./aave.ts";
import { repayToReachHealth } from "./venue.ts";

const DEFAULT_MIN_HF = 1.5;
/** Floors outside this are not safety, they are a different decision. */
const FLOOR_RANGE = [1.15, 2.5] as const;
/** How much warning the floor should buy, in days of ordinary movement. */
const CUSHION_DAYS = 7;

/**
 * The fall in collateral value that would put this loan at the liquidation
 * line. A health factor of 1.30 survives a 23% drop and not a 24% one.
 */
export const dropToLiquidation = (healthFactor: number) =>
  healthFactor > 1 && Number.isFinite(healthFactor) ? 1 - 1 / healthFactor : 0;

/**
 * A floor that leaves a week of ordinary movement between the loan and
 * liquidation.
 *
 * 1.5 was a reasonable constant and a poor rule: on BTCB it is needlessly
 * tight, and on something that moves 15% a day it is a floor you would fall
 * through before anyone looked. Solved from the volatility of whatever is
 * actually posted, and clamped, because a number this far from 1 stops being
 * about safety.
 */
export function floorFor(daily: number | null) {
  if (daily === null || !(daily > 0)) return DEFAULT_MIN_HF;
  // A week of movement scales with the square root of time.
  const cushion = Math.min(0.9, daily * Math.sqrt(CUSHION_DAYS));
  const floor = 1 / (1 - cushion);
  return Math.min(FLOOR_RANGE[1], Math.max(FLOOR_RANGE[0], Number(floor.toFixed(2))));
}
/** Aave marks the variable rate mode as 2 in repay(). */
const VARIABLE_RATE = 2n;

async function loadAccount(params: Record<string, string>) {
  const wallet = requireAddress(params, "wallet");
  const minHealthFactor = params.minHealthFactor
    ? requireNumber(params, "minHealthFactor")
    : DEFAULT_MIN_HF;
  // Above 1 or the floor is below liquidation; below 10 because the field's
  // own example is 1.5, and typing 15 for 1.5 would quietly turn "top the loan
  // up" into "repay all of it".
  if (minHealthFactor <= 1) throw new InvalidParams("minHealthFactor must be above 1");
  if (minHealthFactor > 10) throw new InvalidParams("minHealthFactor must be 10 or less");

  const [collateral, debt, , threshold, , healthFactor] = await userAccountData(wallet);
  return {
    wallet,
    minHealthFactor,
    collateralBase: Number(formatUnits(collateral, BASE_DECIMALS)),
    debtBase: Number(formatUnits(debt, BASE_DECIMALS)),
    thresholdBps: Number(threshold),
    // No debt means no liquidation risk, which Aave reports as uint256 max.
    healthFactor:
      healthFactor === maxUint256
        ? Number.POSITIVE_INFINITY
        : Number(formatUnits(healthFactor, 18)),
  };
}

/** The debt the wallet owes most of — repaying it moves the health factor furthest. */
async function largestDebt(wallet: Address) {
  const assets = await reservesList();
  const positions = await Promise.all(
    assets.map(async (asset) => {
      const reserve = await reserveData(asset);
      const [balance, decimals, symbol] = await Promise.all([
        bscClient.readContract({
          address: reserve.variableDebtTokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
        bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
        bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
      ]);
      return { asset, balance, decimals, symbol };
    }),
  );
  const owed = positions.filter((position) => position.balance > 0n);
  if (owed.length === 0) return null;

  const valued = await Promise.all(
    owed.map(async (position) => {
      const price = await assetPrice(position.asset);
      return {
        ...position,
        price,
        // Base-currency value of the debt, so the biggest is the biggest in USD.
        valueBase:
          Number(formatUnits(position.balance, position.decimals)) *
          Number(formatUnits(price, BASE_DECIMALS)),
      };
    }),
  );
  return valued.reduce((a, b) => (b.valueBase > a.valueBase ? b : a));
}

/**
 * Recent borrowers with their health factor read live. A liquidation-defence
 * agent should show the queue it is standing in, not just your own number.
 */
async function atRiskAccounts(you: Address) {
  const latest = await bscClient.getBlockNumber();
  const logs = await bscClient.getLogs({
    address: AAVE_POOL,
    event: parseAbiItem(
      "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
    ),
    fromBlock: latest - LOG_SPAN,
    toBlock: latest,
  });

  const wallets = [...new Set([you, ...logs.map((log) => log.args.onBehalfOf as Address)])].slice(
    0,
    12,
  );
  const rows = await Promise.all(
    wallets.map(async (wallet) => {
      const [collateral, debt, , , , healthFactor] = await userAccountData(wallet);
      return {
        wallet,
        isYou: wallet.toLowerCase() === you.toLowerCase(),
        collateralBase: Number(formatUnits(collateral, BASE_DECIMALS)),
        debtBase: Number(formatUnits(debt, BASE_DECIMALS)),
        healthFactor:
          healthFactor === maxUint256
            ? Number.POSITIVE_INFINITY
            : Number(formatUnits(healthFactor, 18)),
      };
    }),
  );
  // Sub-dollar debt makes the health factor a meaningless seven-digit number.
  return rows.filter((row) => row.debtBase >= 1).sort((a, b) => a.healthFactor - b.healthFactor);
}

/**
 * The collateral the wallet holds most of. Its price is what actually drags a
 * health factor down, so that is the line worth charting.
 */
async function largestCollateral(wallet: Address) {
  const assets = await reservesList();
  const held = await Promise.all(
    assets.map(async (asset) => {
      const reserve = await reserveData(asset);
      const [balance, decimals, symbol, price] = await Promise.all([
        bscClient.readContract({
          address: reserve.aTokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
        bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
        bscClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }),
        assetPrice(asset),
      ]);
      return {
        asset,
        symbol,
        valueBase:
          Number(formatUnits(balance, decimals)) * Number(formatUnits(price, BASE_DECIMALS)),
      };
    }),
  );
  const funded = held.filter((entry) => entry.valueBase > 0);
  return funded.length ? funded.reduce((a, b) => (b.valueBase > a.valueBase ? b : a)) : null;
}

export const healthMonitor: AgentPlugin = {
  id: "aave-health-monitor",
  name: "Aave Health Guard",
  category: "health",
  protocol: "Aave V3",
  chainId: 56,
  summary:
    "If you have borrowed against your crypto, a falling market can trigger a forced sale of it. This watches how close you are to that line and pays back just enough to step away from it.",
  paramSchema: [
    { key: "wallet", label: "Wallet", placeholder: "0x..." },
    { key: "minHealthFactor", label: "Minimum health factor", placeholder: "1.5" },
  ],
  example: { wallet: "0x1e01000ba272c96013c913a6a6bC61722E24E9EB", minHealthFactor: "1.5" },
  grants: [
    "Looks at what you have put up, what you owe, and how close that is to a forced sale",
    "Pays down your biggest loan for you, out of your own balance",
    "Gives permission for exactly the repayment, nothing more",
    "Cannot borrow, cannot take out what you put up, and cannot send money anywhere but into your own loan",
    "Nothing is repaid until you approve it — or until a temporary key you set limits on and can cancel approves it for you",
  ],

  async insights(params): Promise<AgentInsights> {
    const account = await loadAccount(params);
    const neighbours = await atRiskAccounts(account.wallet).catch(() => []);

    return {
      stats: [
        {
          label: "Health factor",
          value: account.debtBase === 0 ? "—" : account.healthFactor.toFixed(2),
          hint: `floor ${account.minHealthFactor}`,
        },
        { label: "Collateral", value: `$${account.collateralBase.toFixed(2)}` },
        { label: "Debt", value: `$${account.debtBase.toFixed(2)}` },
        {
          label: "Liquidation at",
          value: `${(account.thresholdBps / 100).toFixed(1)}%`,
          hint: "weighted threshold",
        },
      ],
      table: {
        title: "Borrowers in range",
        caption:
          "Every wallet that borrowed on Aave V3 BNB Chain in the last ~9,000 blocks, with its health factor read live. Yours is marked.",
        columns: [
          { key: "wallet", label: "Wallet" },
          { key: "health", label: "Health", align: "end" },
          { key: "collateral", label: "Collateral", align: "end" },
          { key: "debt", label: "Debt", align: "end" },
        ],
        rows: neighbours.map((entry) => ({
          id: entry.wallet,
          href: explorerLink(entry.wallet),
          wallet: `${entry.wallet.slice(0, 8)}...${entry.wallet.slice(-4)}${entry.isYou ? "  (you)" : ""}`,
          health:
            entry.healthFactor === Number.POSITIVE_INFINITY
              ? "no debt"
              : entry.healthFactor.toFixed(2),
          collateral: `$${entry.collateralBase.toFixed(0)}`,
          debt: `$${entry.debtBase.toFixed(0)}`,
        })),
      },
      activity: await recentActivity([
        {
          address: AAVE_POOL,
          kind: "BORROW",
          event: parseAbiItem(
            "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
          ),
          describe: (args) =>
            `${String(args.onBehalfOf).slice(0, 10)} borrowed against their collateral`,
        },
        {
          address: AAVE_POOL,
          kind: "REPAY",
          event: parseAbiItem(
            "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
          ),
          describe: (args) => `${String(args.user).slice(0, 10)} repaid part of a loan`,
        },
        {
          address: AAVE_POOL,
          kind: "LIQUIDATED",
          event: parseAbiItem(
            "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
          ),
          describe: (args) => `${String(args.user).slice(0, 10)} was liquidated`,
        },
      ]).catch(() => []),
    };
  },

  async status(params): Promise<AgentStatus> {
    const account = await loadAccount(params);
    if (account.debtBase === 0) {
      return {
        headline: "No debt",
        detail: "Nothing borrowed, nothing to liquidate.",
        actionable: false,
      };
    }
    const safe = account.healthFactor >= account.minHealthFactor;
    return {
      headline: safe
        ? `Healthy at ${account.healthFactor.toFixed(2)}`
        : `At risk: ${account.healthFactor.toFixed(2)}`,
      detail: `$${account.collateralBase.toFixed(2)} collateral against $${account.debtBase.toFixed(2)} debt, liquidates below 1.00, your floor is ${account.minHealthFactor}`,
      actionable: !safe,
    };
  },

  async autoParams(wallet): Promise<AutoParams | null> {
    const [, debt, , , , healthFactor] = await userAccountData(wallet);
    // Nothing borrowed means nothing to defend. This agent guards a position
    // the user already has; it cannot create one out of a deposit.
    if (debt === 0n) return null;

    const current =
      healthFactor === maxUint256
        ? Number.POSITIVE_INFINITY
        : Number(formatUnits(healthFactor, 18));

    // The floor is a safety threshold, not a function of where the loan
    // happens to sit — deriving it from the current health factor would make a
    // comfortable loan permanently "at risk". It does depend on what is posted:
    // the same 1.5 is slack on BTCB and thin on something that moves 15% a day.
    const collateral = await largestCollateral(wallet).catch(() => null);
    const daily = collateral ? dailyVolatility(await tokenSeries(collateral.asset, 48)) : null;
    const floor = floorFor(daily);

    const room = dropToLiquidation(current);
    const days = daily ? daysToMove(room, daily) : null;
    const runway =
      days === null
        ? ""
        : ` A ${(room * 100).toFixed(0)}% fall liquidates it, about ${days < 1 ? "a day" : `${Math.round(days)} days`} of ordinary movement away.`;

    return {
      params: { wallet, minHealthFactor: String(floor) },
      reason:
        current >= floor
          ? `Loan is at ${current.toFixed(2)}, above the ${floor} floor.${runway}`
          : `Loan is at ${current.toFixed(2)}, under the ${floor} floor.${runway}`,
    };
  },

  async series(params): Promise<AgentSeries | null> {
    const account = await loadAccount(params);
    if (account.debtBase === 0) return null;

    const collateral = await largestCollateral(account.wallet);
    if (!collateral) return null;
    const prices = await tokenSeries(collateral.asset);
    if (prices.length < 2) return null;

    // No contract keeps a health-factor history, and public endpoints will not
    // serve archive state. Holding the balances fixed and replaying the
    // collateral price gives the shape of the last two days honestly — the
    // label says which asset is driving it.
    const now = prices[prices.length - 1].v;
    if (!now) return null;

    const icons = await tokenLogos([collateral.asset]).catch(() => new Map());
    return {
      logos: [icons.get(collateral.asset.toLowerCase())].filter((url) => url !== undefined),
      label: `Health factor · tracking ${collateral.symbol}`,
      points: prices.map((point) => ({
        t: point.t,
        v: account.healthFactor * (point.v / now),
      })),
      band: { from: account.minHealthFactor, to: account.healthFactor * 2 },
    };
  },

  async scope(params): Promise<SessionScope> {
    const account = await loadAccount(params);
    const debt = await largestDebt(account.wallet).catch(() => null);
    if (!debt) return { calls: [{ to: AAVE_POOL, label: "Aave V3 pool" }], spend: [] };

    const repayBase = repayToReachHealth(
      account.collateralBase,
      account.debtBase,
      account.thresholdBps,
      account.minHealthFactor,
    );
    const price = Number(formatUnits(debt.price, BASE_DECIMALS));
    const owed = Number(formatUnits(debt.balance, debt.decimals));
    return {
      calls: [
        { to: AAVE_POOL, label: "Aave V3 pool" },
        { to: debt.asset, label: `${debt.symbol} token` },
      ],
      spend: [
        {
          token: debt.asset,
          symbol: debt.symbol,
          decimals: debt.decimals,
          // The repayment that restores the floor, and never more than is
          // owed — a session should be the narrowest grant that still works.
          suggested: plainNumber(price > 0 ? Math.min(repayBase / price, owed) : 0),
        },
      ],
    };
  },

  async plan(params): Promise<AgentAction | null> {
    const account = await loadAccount(params);
    if (account.debtBase === 0 || account.healthFactor >= account.minHealthFactor) return null;

    const repayBase = repayToReachHealth(
      account.collateralBase,
      account.debtBase,
      account.thresholdBps,
      account.minHealthFactor,
    );
    if (repayBase <= 0) return null;

    const debt = await largestDebt(account.wallet);
    if (!debt) return null;

    const price = Number(formatUnits(debt.price, BASE_DECIMALS));
    const owed = Number(formatUnits(debt.balance, debt.decimals));
    // Never try to repay more of this asset than the wallet actually owes.
    const repayTokens = Math.min(repayBase / price, owed);
    const amount = parseUnits(repayTokens.toFixed(debt.decimals), debt.decimals);
    if (amount === 0n) return null;

    const allowance = await bscClient.readContract({
      address: debt.asset,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.wallet, AAVE_POOL],
    });

    const txs: AgentTx[] = [];
    if (allowance < amount) {
      txs.push({
        to: debt.asset,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [AAVE_POOL, amount],
        }),
      });
    }
    txs.push({
      to: AAVE_POOL,
      data: encodeFunctionData({
        abi: poolAbi,
        functionName: "repay",
        args: [debt.asset, amount, VARIABLE_RATE, account.wallet],
      }),
    });

    return {
      // repayBase is what the floor asks for; repayTokens is what the wallet
      // actually owes and will pay. Quoting the first next to the second
      // described 974 USDT as $1,776 — the same stablecoin, twice, differently.
      reason: `Repay ${plainAmount(repayTokens)} ${debt.symbol} (about $${(repayTokens * price).toFixed(2)}) to lift the health factor from ${account.healthFactor.toFixed(2)} back to ${account.minHealthFactor}.`,
      txs,
    };
  },
};
