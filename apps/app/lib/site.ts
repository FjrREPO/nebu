/** Where the site actually lives. Absolute URLs in metadata need it. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nebu.ifajar.dev");

export const TAGLINE =
  "Deposit BNB and an agent takes it from there — rebalancing, grid trading, yield routing and health-factor defence on BNB Smart Chain, under a session key you cap and revoke.";
