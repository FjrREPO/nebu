import type { AgentSeries } from "@nebu/core";

/** Precision enough to tell two nearby readings apart, and no more. */
export function fmt(value: number, unit?: string) {
  if (unit?.trim() === "bps") return `${Math.round(value)}${unit}`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  const magnitude = Math.abs(value);
  return `${value.toFixed(magnitude >= 1 ? 2 : 6)}${unit ?? ""}`;
}

/** How far the agent's number moved across the window, in its own unit. */
export function trendOf(series: AgentSeries | null) {
  if (!series || series.points.length < 2) return null;
  const first = series.points[0].v;
  const last = series.points.at(-1)?.v ?? first;
  const delta = last - first;
  return {
    last,
    delta,
    direction: Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down",
  } as const;
}
