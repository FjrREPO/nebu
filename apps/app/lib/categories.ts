/** Client-safe: the nav and the cards both need these labels. */
export const CATEGORIES = [
  { key: "rebalancing", number: "01", label: "REBALANCING" },
  { key: "grid", number: "02", label: "GRID_TRADING" },
  { key: "yield", number: "03", label: "YIELD_ROUTING" },
  { key: "health", number: "04", label: "LIQUIDATION_GUARD" },
] as const;

export const categoryLabel = (key: string) =>
  CATEGORIES.find((entry) => entry.key === key)?.label ?? key.toUpperCase();
