"use client";

import { type AgentSeries, fallbackLogo, type Holding, type SeriesPoint } from "@nebu/core";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { agentAuto, agentHoldings, agentOutlook, bnbMarket } from "@/lib/agent-api";
import { useAgentWallet } from "@/lib/agent-wallet";
import type { AgentMeta } from "@/lib/agents";
import { depositedInto } from "@/lib/deposits";
import { hiredAgents } from "@/lib/hires";
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
  /** What this holding was worth in dollars, hour by hour. */
  usd: { t: number; v: number }[];
  /** What it expects to earn, for the headline rate. */
  apr: number | null;
  pending: boolean;
};

const bnb = (value: number) => `${value.toFixed(4)} BNB`;
const usd = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const move = (fraction: number) => `${fraction >= 0 ? "+" : ""}${(fraction * 100).toFixed(2)}%`;
const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : "—";

export function PortfolioPanel({ agents }: { agents: AgentMeta[] }) {
  const wallet = useAgentWallet();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [deposited, setDeposited] = useState(0);
  const [market, setMarket] = useState<{ usd: number | null; history: SeriesPoint[] }>({
    usd: null,
    history: [],
  });

  // One price everything here is read in, fetched once for the panel.
  useEffect(() => {
    let alive = true;
    void bnbMarket().then((answer) => {
      if (alive && answer.ok) setMarket(answer.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [hired, setHired] = useState<string[]>([]);
  useEffect(() => {
    setDeposited(depositedInto(wallet.address));
    setHired(hiredAgents(wallet.address));
  }, [wallet.address]);

  const load = useCallback(
    (alive: () => boolean) => {
      const owner = wallet.address;
      if (!owner) return setPositions(null);
      setPositions(
        agents.map((meta) => ({ meta, items: [], bnb: 0, usd: [], apr: null, pending: true })),
      );

      for (const meta of agents) {
        void (async () => {
          const chosen = await agentAuto(meta.id, owner);
          if (!chosen.ok || !chosen.data) {
            if (alive()) settle(meta.id, { items: [], bnb: 0, usd: [], apr: null });
            return;
          }
          const params = chosen.data.params as Record<string, string>;
          const [held, view] = await Promise.all([
            agentHoldings(meta.id, params),
            agentOutlook(meta.id, params),
          ]);
          if (!alive()) return;
          const items = held.ok ? held.data.items.filter((item) => item.amount > 0) : [];
          settle(meta.id, {
            items,
            bnb: items.reduce((sum, item) => sum + (item.bnb ?? 0), 0),
            usd: held.ok ? held.data.usd : [],
            apr: view.ok && view.data?.kind === "return" ? view.data.apr : null,
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
  // Positions only ever add to the total, so there is no reason to hide it
  // until the last agent answers. One slow lending read was blanking the
  // value, the rate and the portfolio line all at once.
  const reading = positions?.some((position) => position.pending) ?? true;
  const settled = !reading;
  const change = deposited > 0 ? total - deposited : null;

  /**
   * The line, in dollars.
   *
   * A wallet holding nothing but BNB is flat against BNB and has a real story
   * against the dollar, which is the story most people are actually asking
   * for. Positions bring their own dollar history; the free BNB is priced with
   * the same hours.
   */
  const bnbAt = new Map(market.history.map((point) => [point.t, point.v]));
  const parts = held.map((position) => position.usd).filter((points) => points.length > 1);
  const hours = market.history.length > 1 ? market.history.map((point) => point.t) : [];
  const dollars = hours
    .map((t) => {
      const price = bnbAt.get(t);
      if (price === undefined) return null;
      let value = free * price;
      for (const points of parts) {
        const at = points.find((point) => point.t === t);
        if (at === undefined) return null;
        value += at.v;
      }
      return { t, v: value };
    })
    .filter((point): point is { t: number; v: number } => point !== null);

  const nowUsd = market.usd === null ? null : total * market.usd;
  // A day ago, as close as the feed gets to one.
  const dayAgo = dollars.find((point) => point.t >= (dollars.at(-1)?.t ?? 0) - 86_400);
  const dayMove =
    dayAgo && dollars.length > 1 && dayAgo.v > 0
      ? ((dollars.at(-1) as { v: number }).v - dayAgo.v) / dayAgo.v
      : null;
  const earning = held.reduce(
    (sum, position) => sum + (position.apr ?? 0) * (total > 0 ? position.bnb / total : 0),
    0,
  );

  // An empty wallet drawn hour by hour is a flat line at nothing.
  const series: AgentSeries | null =
    dollars.length > 1 && total > 0
      ? {
          label: "Portfolio · priced back over two days",
          unit: "$",
          points: dollars,
          // What you sent, in today's dollars: the line to be above.
          ...(deposited > 0 && market.usd
            ? { band: { from: deposited * market.usd, to: deposited * market.usd } }
            : {}),
        }
      : null;

  return (
    <div className="space-y-[20px] max-w-[640px] anim-fade-up" style={{ animationDelay: "560ms" }}>
      <div className="border border-white/15">
        <div className="p-[20px]">
          <span className={legend}>Portfolio</span>
          <p className="font-graphik text-white text-[34px] leading-[1.05] mt-[8px]">
            {bnb(total)}
          </p>
          <p className="font-manrope text-white/50 text-[12px] leading-[16px] mt-[6px]">
            {bnb(free)} free · {bnb(atWork)} at work{reading && " · still reading"}
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

        {/* The four numbers people actually ask for. */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-white/10 divide-x divide-y md:divide-y-0 divide-white/10">
          {[
            ["Value", nowUsd === null ? "—" : usd(nowUsd)],
            [
              "24 hours",
              dayMove === null ? "—" : move(dayMove),
              dayMove === null ? "" : dayMove >= 0 ? "text-[#AFDDFF]" : "text-[#ff9d9d]",
            ],
            ["Hired", hired.length === 0 ? "none" : `${hired.length}`],
            // Weighted by what each agent is actually holding, so an agent with
            // nothing in it cannot lift the number.
            ["Earning at", earning > 0 ? move(earning).replace("+", "") : reading ? "…" : "idle"],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-[14px] py-[11px]">
              <span className={legend}>{label}</span>
              <p
                className={`font-graphik text-[17px] leading-[22px] mt-[4px] ${tone || "text-white"}`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* One bar, the same order as the rows under it. */}
        <div className="flex h-[10px] w-full border-t border-white/10 overflow-hidden">
          {total > 0 ? (
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
            // Still reading is a pulse; nothing to show is just a line.
            <div className={`w-full bg-white/[0.04] ${reading ? "animate-pulse" : ""}`} />
          )}
        </div>
      </div>

      {series && (
        <div className="border border-white/15 p-[12px]">
          <DetailChart series={series} height={180} />
        </div>
      )}

      <div className="border border-white/15 divide-y divide-white/10">
        {!reading && held.length === 0 && (
          <p className="px-[16px] py-[13px] font-manrope text-white/45 text-[12px] leading-[16px]">
            Nothing at work yet. Hire an agent and what it holds turns up here.
          </p>
        )}
        {/* An agent holding nothing is not a position, it is a row of dashes. */}
        {(positions ?? [])
          .filter((position) => position.pending || position.bnb > 0)
          .map((position, index) => (
            <div
              key={position.meta.id}
              className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px] px-[16px] py-[13px]"
            >
              <span
                className="size-[9px] shrink-0 translate-y-[1px]"
                style={{
                  background:
                    position.bnb > 0 ? TINTS[index % TINTS.length] : "rgba(255,255,255,.2)",
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
            {total > 0 ? share(free, total) : ""}
          </span>
        </div>
      </div>

      <p className="font-manrope text-white/40 text-[11px] leading-[15px]">
        Positions are read from the chain. The line is what today's holding was worth hour by hour
        over the last two days — what the market did to it, not a record of what you did — and the
        dashed line, when there is one, is what you sent.
      </p>
    </div>
  );
}
