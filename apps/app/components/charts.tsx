"use client";

import type { AgentSeries } from "@nebu/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt } from "@/lib/series";
import { ACCENT } from "./ui";

type XY = { x: number; y: number };

const linePath = (pts: XY[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("");

const areaPath = (pts: XY[], height: number) => {
  const last = pts.at(-1);
  return last ? `${linePath(pts)}L${last.x},${height}L${pts[0].x},${height}Z` : "";
};

/**
 * A series that never moved has no shape to show, and every point normalises
 * to zero — which used to put the line flat along the floor, reading as a
 * value that had collapsed rather than one that held steady. Flat sits in the
 * middle instead.
 */
const place = (value: number, min: number, span: number) =>
  span === 0 ? 0.5 : 1 - (value - min) / span;

function scale(values: number[], width: number, height: number, padTop = 8, x0 = 0) {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const step = width / (values.length - 1);
  return values.map((v, i) => ({
    x: +(x0 + i * step).toFixed(2),
    y: +(padTop + place(v, min, span) * (height - padTop)).toFixed(2),
  }));
}

const SPARK_W = 340;
const SPARK_H = 72;

/** Card sparkline. The gradient id must be unique or every card borrows the first. */
export function Sparkline({ series }: { series: AgentSeries }) {
  const id = useId();
  const pts = scale(
    series.points.map((point) => point.v),
    SPARK_W,
    SPARK_H,
  );
  if (pts.length < 2) return null;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block h-[72px] w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, SPARK_H)} fill={`url(#${id})`} />
      <path
        d={linePath(pts)}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const ROW_W = 92;
const ROW_H = 28;
/** Direction is the only thing a row-height line can say, so it says it in colour. */
const UP = "#5ee0a0";
const DOWN = "#ff8a8a";

/** The trend cell at the end of a table row: no axis, no dates, just the shape. */
export function RowSpark({ values }: { values?: string }) {
  const nums = (values ?? "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (nums.length < 2) return <span className="text-white/25">—</span>;

  const pts = scale(nums, ROW_W, ROW_H, 3);
  return (
    <svg
      viewBox={`0 0 ${ROW_W} ${ROW_H}`}
      className="inline-block h-[28px] w-[92px] align-middle"
      aria-hidden
    >
      <path
        d={linePath(pts)}
        fill="none"
        stroke={(nums.at(-1) as number) >= nums[0] ? UP : DOWN}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const MARGIN = { top: 16, right: 60, bottom: 26, left: 0 };

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const rough = (max - min) / (count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((base) => rough / pow <= base) ?? 10) * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/** Detail chart: hairline axis on the right, value under the cursor. */
export function DetailChart({ series, height = 260 }: { series: AgentSeries; height?: number }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const values = useMemo(() => series.points.map((point) => point.v), [series.points]);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const yFor = (value: number) => MARGIN.top + place(value, min, span) * plotH;
  const pts = scale(values, plotW, plotH + MARGIN.top, MARGIN.top, MARGIN.left);

  const active = hover === null ? null : series.points[hover];
  const every = Math.max(1, Math.round(series.points.length / Math.max(1, plotW / 130)));

  return (
    <div>
      <div className="mb-[14px] flex items-baseline justify-between gap-4">
        <span className="font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide">
          {series.label}
        </span>
        <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
          {active
            ? `${fmt(active.v, series.unit)} · ${new Date(active.t * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}`
            : fmt(values.at(-1) ?? 0, series.unit)}
        </span>
      </div>

      <div ref={box}>
        {width > 0 && pts.length > 1 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={series.label}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const step = plotW / (series.points.length - 1);
              const index = Math.round((event.clientX - rect.left - MARGIN.left) / step);
              setHover(Math.min(series.points.length - 1, Math.max(0, index)));
            }}
          >
            <title>{series.label}</title>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor={ACCENT} stopOpacity="0.18" />
                <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>

            {series.band && (
              <rect
                x={MARGIN.left}
                width={plotW}
                y={Math.min(yFor(series.band.to), yFor(series.band.from))}
                height={Math.abs(yFor(series.band.from) - yFor(series.band.to))}
                fill={ACCENT}
                opacity="0.06"
              />
            )}

            {niceTicks(min, Math.max(...values)).map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={MARGIN.left + plotW + 10}
                  y={yFor(tick) + 4}
                  className="font-manrope"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="11"
                >
                  {fmt(tick, series.unit)}
                </text>
              </g>
            ))}

            <path d={areaPath(pts, MARGIN.top + plotH)} fill={`url(#${id})`} />
            <path
              d={linePath(pts)}
              fill="none"
              stroke={ACCENT}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {series.points.map((point, index) =>
              index % every === 0 ? (
                <text
                  key={point.t}
                  x={pts[index]?.x}
                  y={height - 6}
                  textAnchor="middle"
                  className="font-manrope"
                  fill="rgba(255,255,255,0.35)"
                  fontSize="11"
                >
                  {new Date(point.t * 1000).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </text>
              ) : null,
            )}

            {hover !== null && pts[hover] && (
              <g>
                <line
                  x1={pts[hover].x}
                  x2={pts[hover].x}
                  y1={MARGIN.top}
                  y2={MARGIN.top + plotH}
                  stroke="rgba(255,255,255,0.25)"
                />
                <circle cx={pts[hover].x} cy={pts[hover].y} r="3" fill={ACCENT} />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
