"use client";

import type { AgentSeries } from "@nebu/core";
import { useId } from "react";
import { areaPath, linePath } from "./chart/path";

const W = 346;
const H = 110;
const PAD_TOP = 8;

/**
 * Card sparkline: the viewBox stretches to the container, the stroke stays
 * 1.5px. The gradient id has to be unique — four cards on a page sharing one
 * id makes three of them borrow the first card's fill.
 */
export function Sparkline({ series }: { series: AgentSeries }) {
  const id = useId();
  const values = series.points.map((point) => point.v);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = W / (values.length - 1);
  const pts = values.map((value, index) => ({
    x: +(index * step).toFixed(2),
    y: +(PAD_TOP + (1 - (value - min) / span) * (H - PAD_TOP)).toFixed(2),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      className="spark"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--spark)" stopOpacity="0.24" />
          <stop offset="1" stopColor="var(--spark)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, H)} fill={`url(#${id})`} />
      <path
        d={linePath(pts)}
        fill="none"
        stroke="var(--spark)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** How far the agent's number moved across the window, in its own unit. */
export function trendOf(series: AgentSeries | null) {
  if (!series || series.points.length < 2) return null;
  const first = series.points[0].v;
  const last = series.points[series.points.length - 1].v;
  const delta = last - first;
  return {
    last,
    delta,
    direction: Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down",
  } as const;
}

/**
 * A health factor, a percentage and a basis-point spread all want different
 * precision, and the unit is the only clue about which one this is.
 */
export function formatValue(value: number, unit?: string) {
  if (unit?.trim() === "bps") return Math.round(value).toString();
  if (unit === "%") return value.toFixed(1);
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0";
  return value.toFixed(magnitude >= 1000 ? 2 : magnitude >= 1 ? 2 : 6);
}
