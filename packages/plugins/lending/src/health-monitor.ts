import {
  type AgentAction,
  type AgentInsights,
  type AgentPlugin,
  type AgentStatus,
  type AgentTx,
  bscClient,
  InvalidParams,
  LOG_SPAN,
  recentActivity,
  requireAddress,
  requireNumber,
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
/** Aave marks the variable rate mode as 2 in repay(). */
const VARIABLE_RATE = 2n;

async function loadAccount(params: Record<string, string>) {
  const wallet = requireAddress(params, "wallet");
  const minHealthFactor = params.minHealthFactor
    ? requireNumber(params, "minHealthFactor")
    : DEFAULT_MIN_HF;
  if (minHealthFactor <= 1) throw new InvalidParams("minHealthFactor must be above 1");

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

export const healthMonitor: AgentPlugin = {
  id: "aave-health-monitor",
  name: "Aave Health Guard",
  category: "health",
  protocol: "Aave V3",
  chainId: 56,
  summary:
    "Tracks the live health factor of a lending position and, when it slips under your floor, sizes the exact repayment that lifts it back.",
  paramSchema: [
    { key: "wallet", label: "Wallet", placeholder: "0x..." },
    { key: "minHealthFactor", label: "Minimum health factor", placeholder: "1.5" },
  ],
  example: { wallet: "0x1e01000ba272c96013c913a6a6bC61722E24E9EB", minHealthFactor: "1.5" },
  grants: [
    "Reads your Aave account: collateral, debt, liquidation threshold, health factor",
    "Repays your largest debt, on your behalf, from your own balance",
    "Approves the pool for exactly the repayment amount",
    "Cannot borrow, withdraw collateral, or move funds anywhere but into your own loan",
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
      reason: `Repay ${repayTokens.toPrecision(6)} ${debt.symbol} (about $${repayBase.toFixed(2)}) to lift the health factor from ${account.healthFactor.toFixed(2)} back to ${account.minHealthFactor}.`,
      txs,
    };
  },
};
