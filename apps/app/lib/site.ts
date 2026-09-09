/** Where the site actually lives. Absolute URLs in metadata need it. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nebu.ifajar.dev");

export const TAGLINE =
  "Hire an agent. Pay it, set its limits, and fire it whenever you want. It just happens to manage your BNB positions 24/7 — rebalancing, trading, finding better interest and protecting your loans.";

/**
 * Which of the two builds this is. The network is a build argument, so mainnet
 * and testnet are two deployments of the same code rather than a switch — and
 * the testnet one exists so people can run the whole flow without spending
 * anything.
 */
export const TESTNET = process.env.NEXT_PUBLIC_SESSION_NETWORK === "testnet";

/** The other deployment, for the links that point across. */
export const TWIN = TESTNET ? "https://nebu.ifajar.dev" : "https://testnet.nebu.ifajar.dev";

/** The bot, for the pages that hand it a wallet to watch. */
export const BOT = "https://t.me/nebuagentbot";
export const botWatch = (agentWallet: string) => `${BOT}?start=${agentWallet}`;
