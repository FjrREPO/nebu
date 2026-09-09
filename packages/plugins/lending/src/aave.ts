import { bscClient, SECONDS_PER_YEAR } from "@nebu/core";
import type { Address } from "viem";

export const AAVE_POOL = "0x6807dc923806fE8Fd134338EABCA509979a7e0cB" as const;

/** Aave quotes everything in a USD base currency with 8 decimals. */
export const BASE_DECIMALS = 8;
const RAY = 1e27;

export const poolAbi = [
  {
    name: "getReservesList",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
  {
    name: "ADDRESSES_PROVIDER",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint16" }],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "repay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const providerAbi = [
  {
    name: "getPriceOracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const oracleAbi = [
  {
    name: "getAssetPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
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
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function reservesList() {
  return bscClient.readContract({
    address: AAVE_POOL,
    abi: poolAbi,
    functionName: "getReservesList",
  });
}

export function reserveData(asset: Address) {
  return bscClient.readContract({
    address: AAVE_POOL,
    abi: poolAbi,
    functionName: "getReserveData",
    args: [asset],
  });
}

export function userAccountData(wallet: Address) {
  return bscClient.readContract({
    address: AAVE_POOL,
    abi: poolAbi,
    functionName: "getUserAccountData",
    args: [wallet],
  });
}

/** Aave publishes a per-second rate in ray; compounding it is what users see. */
export function liquidityRateToApy(rateRay: bigint) {
  const perSecond = Number(rateRay) / RAY / SECONDS_PER_YEAR;
  return Math.expm1(SECONDS_PER_YEAR * Math.log1p(perSecond));
}

let oracle: Promise<Address> | undefined;
export function priceOracle(): Promise<Address> {
  oracle ??= bscClient
    .readContract({ address: AAVE_POOL, abi: poolAbi, functionName: "ADDRESSES_PROVIDER" })
    .then((provider) =>
      bscClient.readContract({
        address: provider,
        abi: providerAbi,
        functionName: "getPriceOracle",
      }),
    );
  return oracle;
}

/** Price of one whole token in Aave's USD base currency (8 decimals). */
export async function assetPrice(asset: Address) {
  return bscClient.readContract({
    address: await priceOracle(),
    abi: oracleAbi,
    functionName: "getAssetPrice",
    args: [asset],
  });
}
