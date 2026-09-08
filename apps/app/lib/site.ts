/** Where the site actually lives. Absolute URLs in metadata need it. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nebu.ifajar.dev");

export const TAGLINE =
  "Hire an agent. Pay it, set its limits, and fire it whenever you want. It just happens to manage your BNB positions 24/7 — rebalancing, trading, finding better interest and protecting your loans.";
