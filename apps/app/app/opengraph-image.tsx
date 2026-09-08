import { ImageResponse } from "next/og";

export const alt = "Nebu — autonomous DeFi agents for BNB Smart Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#AFDDFF";

/**
 * The share card. Drawn rather than shipped as a file so it stays in step with
 * the site's own palette, and so there is no binary in the repo to go stale.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#000",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
        <span style={{ color: "#fff" }}>{"NEBU // AGENTS"}</span>
        <span style={{ color: ACCENT }}>[ BNB SMART CHAIN ]</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Satori has no line breaks — a stack of spans is how a headline wraps. */}
        {["Hire an agent.", "It minds your BNB positions 24/7."].map((line) => (
          <span
            key={line}
            style={{ color: "#fff", fontSize: 68, lineHeight: 1, letterSpacing: -1.5 }}
          >
            {line}
          </span>
        ))}
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 27, marginTop: 8 }}>
          Rebalancing · Grid trading · Yield routing · Health factor
        </span>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {["SET ITS LIMITS", "FIRE IT ANYTIME", "YOUR KEYS STAY YOURS"].map((chip) => (
          <span
            key={chip}
            style={{
              color: "#000",
              background: ACCENT,
              fontSize: 22,
              padding: "6px 12px",
              borderRadius: 3,
            }}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>,
    size,
  );
}
