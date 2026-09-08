/** Client-safe: the nav and the cards both need these labels. */
export const CATEGORIES = [
  { key: "rebalancing", number: "01", label: "KEEPS EARNING FEES" },
  { key: "grid", number: "02", label: "BUYS LOW, SELLS HIGH" },
  { key: "yield", number: "03", label: "FINDS BETTER INTEREST" },
  { key: "health", number: "04", label: "PROTECTS YOUR LOAN" },
] as const;

export const categoryLabel = (key: string) =>
  CATEGORIES.find((entry) => entry.key === key)?.label ?? key.toUpperCase();
