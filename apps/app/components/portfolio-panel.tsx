"use client";

import { type AgentSeries, fallbackLogo, type Holding } from "@nebu/core";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { agentAuto, agentHoldings } from "@/lib/agent-api";
import { useAgentWallet } from "@/lib/agent-wallet";
import type { AgentMeta } from "@/lib/agents";
import { depositedInto } from "@/lib/deposits";
import { DetailChart } from "./charts";
import { TokenMarks } from "./ui";

const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";
const TINTS = ["#AFDDFF", "#7EC0EA", "#5AA0CE", "#3F7FAA"];
/** Whatever is not in a position: the free BNB the agents draw on. */
const CASH = "#2C5A7A";

type Position = {
  meta: AgentMeta;
  items: Holding[];
  bnb: number;
  history: { t: number; v: number }[];
  pending: boolean;
};

const bnb = (value: number) => `${value.toFixed(4)} BNB`;
const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : "—";

/** Two histories over the same hours, added up. */
function combine(all: { t: number; v: number }[][]) {
  const totals = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const series of all) {
    for (const point of series) {
      totals.set(point.t, (totals.get(point.t) ?? 0) + point.v);
      counts.set(point.t, (counts.get(point.t) ?? 0) + 1);
    }
  }
  // Only hours every position could be priced for. A total that silently drops
  // a position for an hour draws a cliff that never happened.
  return [...totals.entries()]
    .filter(([t]) => counts.get(t) === all.length)
    .sort(([a], [b]) => a - b)
    .map(([t, v]) => ({ t, v }));
}

export function PortfolioPanel({ agents }: { agents: AgentMeta[] }) {
  const wallet = useAgentWallet();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [deposited, setDeposited] = useState(0);

  useEffect(() => setDeposited(depositedInto(wallet.address)), [wallet.address]);

  const load = useCallback(
    (alive: () => boolean) => {
      const owner = wallet.address;
      if (!owner) return setPositions(null);
      setPositions(agents.map((meta) => ({ meta, items: [], bnb: 0, history: [], pending: true })));

      for (const meta of agents) {
        void (async () => {
          const chosen = await agentAuto(meta.id, owner);
          if (!chosen.ok || !chosen.data) {
            if (alive()) settle(meta.id, { items: [], bnb: 0, history: [] });
            return;
          }
          const held = await agentHoldings(meta.id, chosen.data.params as Record<string, string>);
          if (!alive()) return;
          const items = held.ok ? held.data.items.filter((item) => item.amount > 0) : [];
          settle(meta.id, {
            items,
            bnb: items.reduce((sum, item) => sum + (item.bnb ?? 0), 0),
            history: held.ok ? held.data.history : [],
          });
        })();
      }

      function settle(id: string, next: Omit<Position, "meta" | "pending">) {
        setPositions(
          (current) =>
            current?.map((row) =>
              row.meta.id === id ? { ...row, ...next, pending: false } : row,
            ) ?? null,
        );
      }
    },
    [agents, wallet.address],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  if (!wallet.address) return null;

  const free = wallet.balance ? Number(formatEther(wallet.balance)) : 0;
  const held = positions?.filter((position) => position.bnb > 0) ?? [];
  const atWork = held.reduce((sum, position) => sum + position.bnb, 0);
  const total = free + atWork;
  const settled = positions?.every((position) => !position.pending) ?? false;
  const change = deposited > 0 ? total - deposited : null;

  // The wallet's own BNB does not move against itself, so the chart is the
  // positions plus a flat line for the cash beside them.
  const histories = held.map((position) => position.history).filter((points) => points.length > 1);
  const combined =
    histories.length === held.length && histories.length > 0 ? combine(histories) : [];
  const series: AgentSeries | null =
    combined.length > 1
      ? {
          label: "What the wallet holds, priced back over two days",
          unit: " BNB",
          points: combined.map((point) => ({ t: point.t, v: point.v + free })),
        }
      : null;

  return (
    <div className="space-y-[20px] max-w-[640px] anim-fade-up" style={{ animationDelay: "560ms" }}>
      <div className="border border-white/15">
        <div className="p-[20px]">
          <span className={legend}>Portfolio</span>
          <p className="font-graphik text-white text-[34px] leading-[1.05] mt-[8px]">
            {settled ? bnb(total) : "—"}
          </p>
          <p className="font-manrope text-white/50 text-[12px] leading-[16px] mt-[6px]">
            {bnb(free)} free · {settled ? bnb(atWork) : "…"} at work
            {change !== null && settled && (
              <>
                {" · "}
                <span className={change >= 0 ? "text-[#AFDDFF]" : "text-[#ff9d9d]"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(4)} BNB
                </span>{" "}
                against {bnb(deposited)} you sent from this device
              </>
            )}
          </p>
        </div>

        {/* One bar, the same order as the rows under it. */}
        <div className="flex h-[10px] w-full border-t border-white/10 overflow-hidden">
          {settled && total > 0 ? (
            <>
              {held.map((position) => (
                <div
                  key={position.meta.id}
                  title={`${position.meta.name} · ${bnb(position.bnb)}`}
                  style={{
                    width: `${(position.bnb / total) * 100}%`,
                    background:
                      TINTS[agents.findIndex((a) => a.id === position.meta.id) % TINTS.length],
                  }}
                />
              ))}
              <div style={{ width: `${(free / total) * 100}%`, background: CASH }} />
            </>
          ) : (
            <div className="w-full bg-white/[0.04] animate-pulse" />
          )}
        </div>
      </div>

      {series && (
        <div className="border border-white/15 p-[12px]">
          <DetailChart series={series} height={180} />
        </div>
      )}

      <div className="border border-white/15 divide-y divide-white/10">
        {(positions ?? []).map((position, index) => (
          <div
            key={position.meta.id}
            className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px] px-[16px] py-[13px]"
          >
            <span
              className="size-[9px] shrink-0 translate-y-[1px]"
              style={{
                background: position.bnb > 0 ? TINTS[index % TINTS.length] : "rgba(255,255,255,.2)",
              }}
            />
            <span className="font-manrope text-white text-[13px] leading-[17px]">
              {position.meta.name}
            </span>
            <span className="ml-auto font-manrope text-white text-[13px]">
              {position.pending ? "…" : position.bnb > 0 ? bnb(position.bnb) : "—"}
            </span>
            <span className="w-[40px] text-right font-manrope text-white/50 text-[11px]">
              {position.bnb > 0 ? share(position.bnb, total) : ""}
            </span>
            {position.items.length > 0 && (
              <span className="w-full flex items-center gap-[8px] font-manrope text-white/45 text-[11px] leading-[15px]">
                <TokenMarks srcs={position.items.map((item) => fallbackLogo(item.token))} />
                {position.items
                  .map(
                    (item) =>
                      `${item.amount.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${item.symbol}`,
                  )
                  .join(" + ")}
              </span>
            )}
          </div>
        ))}

        <div className="flex items-baseline gap-x-[12px] px-[16px] py-[13px]">
          <span className="size-[9px] shrink-0 translate-y-[1px]" style={{ background: CASH }} />
          <span className="font-manrope text-white text-[13px] leading-[17px]">
            Free BNB, waiting to be put to work
          </span>
          <span className="ml-auto font-manrope text-white text-[13px]">{bnb(free)}</span>
          <span className="w-[40px] text-right font-manrope text-white/50 text-[11px]">
            {settled ? share(free, total) : ""}
          </span>
        </div>
      </div>

      <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
        Positions are read from the chain and priced in BNB. The line is today's holding priced back
        over two days, which is what the market did to it rather than a record of what you did.
      </p>
    </div>
  );
}
