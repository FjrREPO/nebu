/**
 * Client-safe: the nav and the cards both need these labels.
 *
 * Kept to eighteen characters. A card is a quarter of the row, and a label
 * that wraps to a second line pushes that one card's name down while its
 * neighbours stay put — which is the whole row looking crooked over one word.
 */
export const CATEGORIES = [
  { key: "rebalancing", number: "01", label: "KEEPS EARNING FEES" },
  { key: "grid", number: "02", label: "TRADES THE SWINGS" },
  { key: "yield", number: "03", label: "FINDS BEST RATES" },
  { key: "health", number: "04", label: "PROTECTS YOUR LOAN" },
] as const;

export const categoryLabel = (key: string) =>
  CATEGORIES.find((entry) => entry.key === key)?.label ?? key.toUpperCase();
