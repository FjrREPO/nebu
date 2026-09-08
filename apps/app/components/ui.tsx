import type { ReactNode } from "react";

export const ACCENT = "#AFDDFF";

export const chipClass =
  "font-manrope bg-[#AFDDFF] rounded-[3px] px-[5px] py-[2px] text-black text-[13px] leading-[15.6px]";

export function Chip({ children }: { children: ReactNode }) {
  return <span className={chipClass}>{children}</span>;
}

/** The bracketed caps this design uses for every technical label. */
export function Bracket({ children }: { children: ReactNode }) {
  return (
    <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
      [ {children} ]
    </span>
  );
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-manrope text-white/50 text-[11px] leading-[14px] ${className}`}>
      {children}
    </p>
  );
}

/** An 18px CDN token icon. next/image would add a proxy hop for nothing. */
export function TokenMark({ src, overlap }: { src?: string; overlap?: boolean }) {
  if (!src) return null;
  const style = `size-[18px] rounded-full bg-black ${overlap ? "-ml-[6px]" : ""}`;
  // biome-ignore lint/performance/noImgElement: too small to be worth optimising
  return <img src={src} alt="" className={style} />;
}

/** A pair of icons, overlapped, for whatever a row or a card is about. */
export function TokenMarks({ srcs }: { srcs?: string[] }) {
  if (!srcs?.length) return null;
  return (
    <span className="inline-flex align-middle">
      {srcs.map((src, index) => (
        <TokenMark key={src} src={src} overlap={index > 0} />
      ))}
    </span>
  );
}

/**
 * The chain's own mark. Inlined because a nav icon that waits on a CDN is a
 * nav icon that pops in after the page has settled.
 */
export function ChainMark({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
      <path
        fill="#fff"
        d="M12.116 14.404 16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26ZM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16Zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257ZM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16Zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293Z"
      />
    </svg>
  );
}

/** A wallet needs a face to be recognisable at a glance; its own bytes are one. */
export function WalletMark({ address, size = 18 }: { address: string; size?: number }) {
  const hue = Number.parseInt(address.slice(2, 6), 16) % 360;
  return (
    <span
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, hsl(${hue} 82% 66%), hsl(${(hue + 64) % 360} 78% 46%))`,
      }}
    />
  );
}

const verticalPositions = ["12.6%", "37.5%", "61.9%", "86.2%"];
const horizontalPositions = ["32.7%", "71.4%"];

/** Plotting grid with a crosshair tick at every intersection. */
export function GridLines({ delay = 600 }: { delay?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {verticalPositions.map((left, i) => (
        <div
          key={left}
          className="absolute top-0 h-full w-px bg-white/[0.04] anim-grid-v"
          style={{ left, animationDelay: `${delay + i * 100}ms` }}
        />
      ))}
      {horizontalPositions.map((top, i) => (
        <div
          key={top}
          className="absolute left-0 w-full h-px bg-white/[0.04] anim-grid-h"
          style={{ top, animationDelay: `${delay + 200 + i * 150}ms` }}
        />
      ))}
      {horizontalPositions.map((top, hi) =>
        verticalPositions.map((left, vi) => (
          <div
            key={`${top}-${left}`}
            className="absolute anim-scale-in"
            style={{ top, left, animationDelay: `${delay + 400 + (hi * 4 + vi) * 80}ms` }}
          >
            <div className="absolute w-[10px] h-px bg-white/70 -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute w-px h-[10px] bg-white/70 -translate-x-1/2 -translate-y-1/2" />
          </div>
        )),
      )}
    </div>
  );
}

/**
 * The notched panel: a rectangle with its bottom-left corner cut away, drawn
 * as an SVG outline so the border can be one hairline at any size.
 */
export function Notch({
  children,
  className = "",
  stroke = ACCENT,
}: {
  children: ReactNode;
  className?: string;
  stroke?: string;
}) {
  return (
    <div className={`relative p-[20px] ${className}`}>
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 280 168"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon
          points="0.5,0.5 279.5,0.5 279.5,167.5 30,167.5 0.5,137.5"
          fill="none"
          stroke={stroke}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}
