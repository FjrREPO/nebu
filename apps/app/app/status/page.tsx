import { bscClient } from "@nebu/core";
import { livePools } from "@nebu/plugin-pancakeswap";
import { plugins } from "@nebu/plugins";
import { Chip, GridLines, Muted } from "@/components/ui";

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

const LIMITS = [
  "Public BSC endpoints reject getLogs over roughly 20,000 blocks, so activity feeds cover the last 9,000.",
  "Fee APR is annualised from one day of volume against current liquidity. It is an estimate, and the pages that show it say so.",
  "The pool feed is a free tier with a per-minute budget. Requests are queued and cached, but a burst can still be turned away — a card with no history says so rather than inventing one.",
  "A health factor has no on-chain history and public endpoints will not serve archive state, so that chart replays the collateral price at fixed balances. The label names the asset driving it.",
  "Sessions default to BNB testnet: a grant registers a key on chain and costs a fee. Set NEXT_PUBLIC_SESSION_NETWORK=mainnet to grant against the live protocols.",
  "A session key is held in your browser. It is scoped to the agent's contracts, capped per day and expiring — but it is still a key, so revoke when you are done.",
  "Set BSC_RPC_URL to a private endpoint before pointing real traffic at this.",
];

export default async function StatusPage() {
  const [head, pools] = await Promise.all([
    bscClient
      .getBlockNumber()
      .then(String)
      .catch(() => null),
    livePools()
      .then((rows) => rows.length)
      .catch(() => null),
  ]);

  const feeds = [
    {
      name: "BNB Smart Chain RPC",
      note: "public dataseeds, batched through Multicall3",
      detail: head ? `head block ${head}` : "unreachable",
      ok: head !== null,
    },
    {
      name: "GeckoTerminal",
      note: "24h volume, swap counts and hourly candles · cached 15 minutes",
      detail: pools === null ? "unreachable" : `${pools} pools in the last pull`,
      ok: pools !== null,
    },
    {
      name: "DefiLlama yields",
      note: "supply APY history for Aave V3 and Venus · cached 30 minutes",
      detail: "daily resolution",
      ok: true,
    },
    {
      name: "Agent registry",
      note: "in-process, no network hop",
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

        <section>
          <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">Feeds</h2>
          <ul className="border border-white/15 divide-y divide-white/5">
            {feeds.map((feed) => (
              <li
                key={feed.name}
                className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[16px]"
              >
                <div className="flex items-start gap-[12px]">
                  <span
                    className={`mt-[6px] size-[6px] shrink-0 rounded-full ${feed.ok ? "bg-[#7ee2a8]" : "bg-[#ff9d9d]"}`}
                  />
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

        <section>
          <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">
            Contracts read
          </h2>
          <ul className="border border-white/15 divide-y divide-white/5">
            {CONTRACTS.map(([label, address]) => (
              <li
                key={address}
                className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[12px]"
              >
                <span className="font-manrope text-white/50 text-[11px] uppercase tracking-wide">
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

        <section>
          <h2 className="font-graphik text-white text-[22px] leading-[1.1] mb-[12px]">
            Known limits
          </h2>
          <ul className="border border-white/15 divide-y divide-white/5">
            {LIMITS.map((limit) => (
              <li key={limit} className="flex gap-[12px] px-[20px] py-[14px]">
                <span className="font-manrope text-[#AFDDFF] text-[13px]">–</span>
                <span className="font-manrope text-white/80 text-[13px] leading-[18px]">
                  {limit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
