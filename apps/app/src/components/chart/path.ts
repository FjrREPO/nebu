// Pure SVG path helpers for the detail/portfolio chart — the template's
// charts/path.ts verbatim (unused scalePoints dropped).

export type XY = { x: number; y: number };

export type ScaledSeries = { pts: XY[]; min: number; span: number };

/**
 * Map values into viewport points. flatPad > 0 pads a flat series' domain
 * so the line centers with symmetric ticks.
 */
export function scaleSeries(
  values: number[],
  opts: Readonly<{
    width: number;
    height: number;
    x0?: number;
    padTop?: number;
    padBottom?: number;
    flatPad?: number;
  }>,
): ScaledSeries {
  const { width, height, x0 = 0, padTop = 0, padBottom = 0, flatPad = 0 } = opts;
  const finite = values.filter((v) => Number.isFinite(v)); // one NaN must not blank the chart
  if (finite.length < 2) return { pts: [], min: 0, span: 1 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    if (flatPad > 0) {
      min -= flatPad;
      max += flatPad;
    } else {
      max = min + 1;
    }
  }
  const span = max - min;
  const innerH = height - padTop - padBottom;
  const step = width / (finite.length - 1);
  return {
    pts: finite.map((v, i) => ({
      x: +(x0 + i * step).toFixed(2),
      y: +(padTop + (1 - (v - min) / span) * innerH).toFixed(2),
    })),
    min,
    span,
  };
}

export function linePath(pts: XY[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("");
}

export function areaPath(pts: XY[], height: number): string {
  const last = pts.at(-1);
  if (!last) return "";
  return `${linePath(pts)}L${last.x},${height}L${pts[0].x},${height}Z`;
}

const NICE_BASES = [1, 2, 2.5, 5, 10];

/** Round a step size to a "nice" value (1/2/2.5/5 × 10^k) for axis ticks. */
export function niceStep(rough: number): number {
  if (rough <= 0 || !Number.isFinite(rough)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const base = rough / pow;
  const nice = NICE_BASES.find((b) => base <= b) ?? 10;
  return nice * pow;
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const build = (step: number) => {
    const start = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  };
  const step = niceStep((max - min) / (count - 1));
  const ticks = build(step);
  // A too-coarse nice step can leave a sparse axis; halve it once.
  return ticks.length >= 3 ? ticks : build(step / 2);
}
