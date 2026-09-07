import {
  type AgentAction,
  type AgentPlugin,
  type AgentStatus,
  type AgentTx,
  bscClient,
  InvalidParams,
  requireAddress,
  requireNumber,
} from "@nebu/core";
import { type Address, encodeFunctionData, formatUnits, maxUint256, parseUnits } from "viem";
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
