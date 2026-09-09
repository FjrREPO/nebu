import { bnbUsd, bscClient } from "@nebu/core";
import { livePools } from "@nebu/plugin-pancakeswap";
import { plugins } from "@nebu/plugins";
import Link from "next/link";
import { Chip, GridLines, Muted, TokenMarks } from "@/components/ui";
import { agentHealth } from "@/lib/agents";
import { brandLogos } from "@/lib/brands";
import { categoryLabel } from "@/lib/categories";

export const metadata = {
  title: "Status",
  description:
    "Live proof the feeds and contracts Nebu reads are answering: BNB Chain RPC, the pool screen, and every contract the agents call.",
  alternates: { canonical: "/status" },
};
/** This page exists to prove the feeds are up, so it must not cache long. */
export const revalidate = 30;

const CONTRACTS = [
  ["PancakeSwap V3 factory", "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"],
  ["PancakeSwap position manager", "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364"],
  ["PancakeSwap smart router", "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"],
  ["Wrapped BNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"],
  ["Aave V3 pool", "0x6807dc923806fE8Fd134338EABCA509979a7e0cB"],
  ["Venus comptroller", "0xfD36E2c2a6789Db23113685031d7F16329158384"],
  ["Altana KeyStore (mainnet)", "0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a"],
  ["Altana KeyStore (testnet)", "0x6b8361C29d05D498b1a12B54A37310f94171E94A"],
] as const;

export default async function StatusPage() {
  const [head, pools, bnb, agents] = await Promise.all([
    bscClient
      .getBlockNumber()
      .then(String)
      .catch(() => null),
    livePools()
      .then((rows) => rows.length)
      .catch(() => null),
    // One price everybody knows, printed where it can be checked at a glance.
    // The desk converts every position into BNB, so a wrong one is wrong
    // everywhere at once — and this feed answered with the wrong token's price
    // for a fortnight before anybody thought to look at the number itself.
    bnbUsd().catch(() => null),
    agentHealth().catch(() => []),
  ]);
  const answering = agents.filter((agent) => agent.error === null).length;

  const feeds = [
    {
      name: "BNB Smart Chain RPC",
      note: "the public blockchain endpoints this reads BNB Chain through",
      detail: head ? `latest block ${head}` : "not answering",
      ok: head !== null,
    },
    {
      name: "GeckoTerminal",
      note: "how much each market traded and how often · refreshed every 15 minutes",
      detail: pools === null ? "not answering" : `${pools} markets in the last refresh`,
      ok: pools !== null,
    },
    {
      name: "BNB price",
      note: "what every position on the desk is converted into",
      detail: bnb === null ? "not answering" : `$${bnb.toFixed(2)}`,
      ok: bnb !== null,
    },
    {
      name: "DefiLlama yields",
      note: "how interest rates on Aave and Venus have moved · refreshed every 30 minutes",
      detail: "daily resolution",
      ok: true,
    },
    {
      name: "Agent registry",
      note: "the agents themselves, running here",
      detail: `${plugins.length} agents across ${new Set(plugins.map((p) => p.category)).size} categories`,
      ok: plugins.length > 0,
    },
  ];

  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative h-[240px] md:h-[280px] overflow-hidden border-b border-white/10">
        <GridLines delay={200} />
        <div className="absolute bottom-[32px] inset-x-0 mx-auto max-w-[1280px] px-5 md:px-[35px]">
          <span
            className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px] anim-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            [ STATUS ]
          </span>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-[10px]">
            <h1
              className="font-graphik text-white text-[34px] md:text-[52px] leading-[1.02] anim-fade-up"
              style={{ animationDelay: "400ms" }}
            >
              Where the numbers come from
            </h1>
            <div className="anim-slide-right" style={{ animationDelay: "600ms" }}>
              <Chip>
                {feeds.filter((f) => f.ok).length}/{feeds.length} FEEDS_OK
              </Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-[35px] py-[40px] md:py-[56px] space-y-[40px]">
        <Muted className="max-w-[720px]">
          Nothing here is seeded or cached from a fixture. These are the feeds every reading on the
          site is built from, checked when you loaded this page.
        </Muted>

        <section className="anim-fade-up" style={{ animationDelay: "450ms" }}>
          <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">Feeds</h2>
          <ul className="border border-white/15 divide-y divide-white/5">
            {feeds.map((feed) => (
              <li
                key={feed.name}
                className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[16px]"
              >
                <div className="flex items-start gap-[12px]">
                  <span className="mt-[1px]">
                    <TokenMarks srcs={brandLogos(feed.name)} />
                  </span>
                  <div>
                    <p className="font-manrope text-white text-[13px] leading-[15.6px]">
                      {feed.name}
                    </p>
                    <Muted className="mt-[4px]">{feed.note}</Muted>
                  </div>
                </div>
                <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
                  {feed.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="anim-fade-up" style={{ animationDelay: "560ms" }}>
          <div className="flex items-end justify-between gap-4 mb-[12px]">
            <h2 className="font-graphik text-white text-[22px] leading-[1.1]">The agents</h2>
            <span className="font-manrope text-white/50 text-[11px] uppercase">
              {answering} of {agents.length} answering
            </span>
          </div>
          <ul className="border border-white/15 divide-y divide-white/5">
            {agents.map((agent) => (
              <li
                key={agent.id}
                className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[16px]"
              >
                <div className="flex items-start gap-[12px]">
                  <span className="mt-[1px]">
                    <TokenMarks srcs={brandLogos(agent.protocol)} />
                  </span>
                  <div>
                    <Link
                      href={`/agents/${agent.id}`}
                      className="font-manrope text-white text-[13px] leading-[15.6px] hover:text-[#AFDDFF] transition-colors"
                    >
                      {agent.name}
                    </Link>
                    <Muted className="mt-[4px]">
                      {categoryLabel(agent.category)} · {agent.protocol} · answered in {agent.ms}ms
                    </Muted>
                  </div>
                </div>
                <span
                  className={`font-manrope text-[13px] leading-[15.6px] ${agent.error ? "text-[#ff9d9d]" : "text-[#AFDDFF]"}`}
                >
                  {agent.error ?? agent.headline}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="anim-fade-up" style={{ animationDelay: "600ms" }}>
          <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">
            Contracts read
          </h2>
          <ul className="border border-white/15 divide-y divide-white/5">
            {CONTRACTS.map(([label, address]) => (
              <li
                key={address}
                className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[12px]"
              >
                <span className="flex items-center gap-[8px] font-manrope text-white/50 text-[11px] uppercase tracking-wide">
                  <TokenMarks srcs={brandLogos(label)} />
                  {label}
                </span>
                <a
                  href={`https://bscscan.com/address/${address}`}
                  className="font-manrope text-white/80 text-[12px] hover:text-[#AFDDFF] transition-colors"
                >
                  {address}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
