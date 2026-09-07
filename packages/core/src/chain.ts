import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";

/** Public BSC endpoints rate-limit individually, so read through several. */
const PUBLIC_RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
  "https://bsc-rpc.publicnode.com",
];

const endpoints = process.env.BSC_RPC_URL ? [process.env.BSC_RPC_URL] : PUBLIC_RPCS;

/**
 * One shared BSC reader for every plugin. Reads are batched through Multicall3,
 * which turns a plugin's dozen calls into one request — the difference between
 * working and getting throttled on public endpoints.
 */
export const bscClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    endpoints.map((url) => http(url, { timeout: 15_000 })),
    { rank: false, retryCount: 2 },
  ),
  batch: { multicall: { wait: 16 } },
});

/**
 * Venus quotes rates per block, so an APY needs the current block time. BSC has
 * changed it three times (3s -> 1.5s -> 0.75s), so measure instead of hardcoding.
 */
let blockSeconds: Promise<number> | undefined;
export function bscBlockSeconds() {
  blockSeconds ??= (async () => {
    const latest = await bscClient.getBlock({ blockTag: "latest" });
    const past = await bscClient.getBlock({ blockNumber: latest.number - 1000n });
    return Number(latest.timestamp - past.timestamp) / 1000;
  })();
  return blockSeconds;
}

export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
