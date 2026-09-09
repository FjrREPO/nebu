"use client";

import {
  type AgentOutlook,
  type Allocation,
  allocate,
  blendedApr,
  type DeskAgent,
} from "@nebu/core";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { agentAuto, agentOutlook } from "@/lib/agent-api";
import { useAgentWallet } from "@/lib/agent-wallet";
import type { AgentMeta } from "@/lib/agents";
import { hiredAgents } from "@/lib/hires";

/** What each agent's slice looks like, in order, so the bar and the rows agree. */
const TINTS = ["#AFDDFF", "#7EC0EA", "#5AA0CE", "#3F7FAA"];

const legend = "font-manrope text-white/50 text-[11px] leading-[14px] uppercase tracking-wide";
const pct = (share: number) => `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`;
const apr = (value: number) => `${(value * 100).toFixed(value >= 1 ? 0 : 1)}%`;

type Row = { meta: AgentMeta; outlook: AgentOutlook | null; hired: boolean };

/** With nothing in the wallet there is still a split to show, just a notional one. */
const PREVIEW_BNB = 1;

export function DeskPanel({ agents }: { agents: AgentMeta[] }) {
  const wallet = useAgentWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hired, setHired] = useState<string[]>([]);

  useEffect(() => setHired(hiredAgents(wallet.address)), [wallet.address]);

  const load = useCallback(async () => {
    const owner = wallet.address;
    const loaded = await Promise.all(
      agents.map(async (meta): Promise<Row> => {
        // With a funded wallet an agent picks its own venue; without one, the
        // marketplace's example is still a live position worth pricing.
        const chosen = owner ? await agentAuto(meta.id, owner) : null;
        const params = chosen?.ok && chosen.data ? chosen.data.params : meta.example;
        const outlook = await agentOutlook(meta.id, params as Record<string, string>);
        return {
          meta,
          outlook: outlook.ok ? outlook.data : null,
          hired: hiredAgents(owner).includes(meta.id),
        };
      }),
    );
    setRows(loaded);
  }, [agents, wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = wallet.balance ? Number(formatEther(wallet.balance)) : 0;
  const working = total > 0 ? total : PREVIEW_BNB;
  // Once something is hired the desk is that hire, not the whole catalogue.
  const inPlay = (rows ?? []).filter((row) => row.outlook && (hired.length === 0 || row.hired));
  const deskAgents: DeskAgent[] = inPlay.map((row) => ({
    id: row.meta.id,
    outlook: row.outlook as AgentOutlook,
  }));
  const split = allocate(deskAgents, working);
  const byId = new Map(split.map((entry) => [entry.id, entry]));
  const blended = blendedApr(deskAgents, split);
  const funded = split.filter((entry) => entry.amount > 0);

  return (
    <div className="space-y-[28px]">
      <div className="grid grid-cols-2 md:grid-cols-4 border border-white/15 divide-x divide-white/10 anim-fade-up">
        {[
          ["Capital", total > 0 ? `${total.toFixed(4)} BNB` : `${PREVIEW_BNB} BNB`],
          ["Agents in the split", String(funded.length)],
          ["Blended return", rows ? apr(blended) : "—"],
          ["Working", rows ? pct(funded.reduce((sum, entry) => sum + entry.share, 0)) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="px-[16px] py-[14px]">
            <span className={legend}>{label}</span>
            <p className="font-graphik text-white text-[22px] leading-[26px] mt-[6px]">{value}</p>
          </div>
        ))}
      </div>

      {/* The split itself, at a glance. */}
      <div className="anim-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="flex h-[46px] w-full border border-white/15 overflow-hidden">
          {rows === null ? (
            <div className="w-full bg-white/[0.04] animate-pulse" />
          ) : funded.length === 0 ? (
            <div className="flex w-full items-center px-[14px] font-manrope text-white/40 text-[12px]">
              Nothing on offer pays for its risk today — the wallet stays in cash.
            </div>
          ) : (
            funded.map((entry) => {
              const index = agents.findIndex((meta) => meta.id === entry.id);
              return (
                <div
                  key={entry.id}
                  title={`${entry.id} · ${pct(entry.share)}`}
                  className="flex items-center px-[10px] overflow-hidden transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    width: `${entry.share * 100}%`,
                    background: TINTS[index % TINTS.length],
                  }}
                >
                  <span className="font-manrope text-black text-[12px] whitespace-nowrap">
                    {pct(entry.share)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="border border-white/15 divide-y divide-white/10">
        {(rows ?? agents.map((meta) => ({ meta, outlook: null, hired: false }))).map(
          (row, index) => {
            const entry: Allocation | undefined = byId.get(row.meta.id);
            return (
              <div
                key={row.meta.id}
                className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[6px] px-[16px] py-[15px] anim-fade-up"
                style={{ animationDelay: `${200 + index * 80}ms` }}
              >
                <span
                  className="size-[9px] shrink-0 translate-y-[1px]"
                  style={{
                    background: entry?.amount
                      ? TINTS[index % TINTS.length]
                      : "rgba(255,255,255,.2)",
                  }}
                />
                <Link
                  href={`/agents/${row.meta.id}`}
                  className="font-manrope text-white text-[14px] leading-[18px] hover:text-[#AFDDFF] transition-colors"
                >
                  {row.meta.name}
                </Link>
                {row.hired && (
                  <span className="border border-[#AFDDFF]/40 px-[6px] py-[1px] font-manrope text-[#AFDDFF] text-[10px] uppercase tracking-wide">
                    Hired
                  </span>
                )}
                <span className="ml-auto font-graphik text-white text-[18px] leading-[22px]">
                  {/* Four places is what a wallet shows; six is what the maths kept. */}
                  {rows === null || !entry?.amount ? "—" : `${entry.amount.toFixed(4)} BNB`}
                </span>
                <span className="w-[52px] text-right font-manrope text-white/50 text-[12px]">
                  {rows === null || !entry?.amount ? "" : pct(entry.share)}
                </span>
                <p className="w-full font-manrope text-white/45 text-[11px] leading-[15px]">
                  {/* The agent's own words already carry the movement; only the
                      year it adds up to is missing. */}
                  {rows === null
                    ? "reading the market…"
                    : row.outlook
                      ? `${entry?.note ?? row.outlook.reason}${
                          row.outlook.kind === "return" ? ` · ${apr(row.outlook.apr)} a year` : ""
                        }`
                      : "no view today"}
                </p>
              </div>
            );
          },
        )}
      </div>

      <p className="font-manrope text-white/40 text-[11px] leading-[16px] max-w-[640px]">
        Cover comes off the top, the rest is split by return against how much the thing moves, and
        anything too small to cover its own gas goes back to the others.{" "}
        {hired.length === 0 && "Hire two or more and the split becomes theirs alone."}
      </p>
    </div>
  );
}
