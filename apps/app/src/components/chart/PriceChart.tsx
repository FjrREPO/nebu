"use client";

import type { AgentSeries } from "@nebu/core";
import { Column, Row, Text } from "@once-ui-system/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { areaPath, linePath, niceTicks, scaleSeries } from "./path";

const MARGIN = { top: 16, right: 64, bottom: 28, left: 8 };
const FLAT_PAD = 0.06;
const PX_PER_X_LABEL = 120;

/** Enough digits to separate two neighbouring ticks, and no more. */
function formatter(values: number[]) {
  const span = Math.max(...values) - Math.min(...values);
  const digits = span === 0 ? 4 : Math.min(8, Math.max(2, Math.ceil(-Math.log10(span / 4)) + 1));
  return (value: number) => value.toFixed(Number.isFinite(digits) ? digits : 4);
}

const hourLabel = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * The agent's own number over time, with an axis and a readable value under the
 * cursor. Same shape as the sparkline on the cards, sized to be read.
 */
export function PriceChart({ series, height = 260 }: { series: AgentSeries; height?: number }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const chart = useMemo(() => {
    const values = series.points.map((point) => point.v);
    const scaled = scaleSeries(values, {
      width: plotWidth,
      height: plotHeight,
      x0: MARGIN.left,
      padTop: MARGIN.top,
      padBottom: 0,
      flatPad: FLAT_PAD * (Math.abs(values[0] ?? 1) || 1),
    });
    const max = scaled.min + scaled.span;
    return {
      ...scaled,
      ticks: niceTicks(scaled.min, max, 5),
      format: (value: number) => `${formatter(values)(value)}${series.unit ?? ""}`,
    };
  }, [series.points, series.unit, plotWidth, plotHeight]);

  if (series.points.length < 2) return null;

  const yFor = (value: number) => MARGIN.top + (1 - (value - chart.min) / chart.span) * plotHeight;

  const active = hover === null ? null : series.points[hover];
  const activePoint = hover === null ? null : chart.pts[hover];

  const labelEvery = Math.max(1, Math.round(series.points.length / (plotWidth / PX_PER_X_LABEL)));

  return (
    <Column fillWidth gap="8">
      <Row fillWidth horizontal="between" vertical="center" gap="16" wrap>
        <Text variant="label-default-s" onBackground="neutral-weak">
          {series.label}
        </Text>
        <Text variant="code-default-s">
          {active
            ? `${chart.format(active.v)} · ${hourLabel(active.t)}`
            : chart.format(series.points.at(-1)?.v ?? 0)}
        </Text>
      </Row>

      <div ref={container} style={{ width: "100%" }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="chart-surface"
            role="img"
            aria-label={series.label}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - box.left - MARGIN.left;
              const step = plotWidth / (series.points.length - 1);
              const index = Math.round(x / step);
              setHover(Math.min(series.points.length - 1, Math.max(0, index)));
            }}
          >
            <title>{series.label}</title>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--spark)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--spark)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {series.band && (
              <rect
                x={MARGIN.left}
                width={plotWidth}
                y={Math.min(yFor(series.band.to), yFor(series.band.from))}
                height={Math.abs(yFor(series.band.from) - yFor(series.band.to))}
                fill="var(--neutral-alpha-weak)"
              />
            )}

            {chart.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="var(--neutral-alpha-weak)"
                />
                <text
                  x={MARGIN.left + plotWidth + 8}
                  y={yFor(tick) + 4}
                  className="chart-tick"
                  fill="var(--neutral-on-background-weak)"
                >
                  {chart.format(tick)}
                </text>
              </g>
            ))}

            <path d={areaPath(chart.pts, MARGIN.top + plotHeight)} fill={`url(#${id})`} />
            <path
              d={linePath(chart.pts)}
              fill="none"
              stroke="var(--spark)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {series.points.map((point, index) =>
              index % labelEvery === 0 ? (
                <text
                  key={point.t}
                  x={chart.pts[index]?.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="chart-tick"
                  fill="var(--neutral-on-background-weak)"
                >
                  {new Date(point.t * 1000).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    hour12: false,
                  })}
                </text>
              ) : null,
            )}

            {activePoint && (
              <g>
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={MARGIN.top}
                  y2={MARGIN.top + plotHeight}
                  stroke="var(--neutral-alpha-medium)"
                />
                <circle cx={activePoint.x} cy={activePoint.y} r="3" fill="var(--spark)" />
              </g>
            )}
          </svg>
        )}
      </div>
    </Column>
  );
}
