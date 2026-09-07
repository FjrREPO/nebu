import { bscClient } from "@nebu/core";
import { livePools, shortlist } from "@nebu/plugin-pancakeswap";
import { plugins } from "@nebu/plugins";

/** The counters are live reads; a minute of staleness is plenty for a landing page. */
export const revalidate = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const GLYPH: Record<string, string> = {
  rebalancing: "[ ]",
  grid: "###",
  yield: "/\\/",
  health: "<+>",
};

const STEPS = [
  {
    n: "01",
    title: "It reads",
    body: "Position ranges, pool ticks, supply rates, health factors — pulled from BNB Smart Chain when you ask, batched through Multicall3.",
  },
  {
    n: "02",
    title: "It shows its work",
    body: "Every agent publishes the table it decided from: the pools it screened, the ladder it holds, the rates it compared, the queue it is standing in.",
  },
  {
    n: "03",
    title: "You sign",
    body: "The agent hands back calldata — approve, exit, remint, repay. It never holds your keys and there is no path for funds to leave your control.",
  },
];

function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`framed ${className}`}>
      <span className="corners" aria-hidden />
      {children}
    </div>
  );
}

export default async function Home() {
  const [pools, head] = await Promise.all([
    livePools()
      .then(shortlist)
      .catch(() => []),
    bscClient
      .getBlockNumber()
      .then(String)
      .catch(() => null),
  ]);

  const counters = [
    { label: "Agents", value: String(plugins.length) },
    { label: "Categories", value: String(new Set(plugins.map((p) => p.category)).size) },
    { label: "Pools in scope", value: pools.length ? String(pools.length) : "—" },
    {
      label: "Best fee APR",
      value: pools[0] ? `${(pools[0].feeApr * 100).toFixed(0)}%` : "—",
    },
  ];

  return (
    <main className="flex-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] blueprint" />

      <header className="relative border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-mono text-lg font-bold text-accent">nebu</span>
          <a
            href={APP_URL}
            className="border border-line px-4 py-2 font-mono text-xs uppercase tracking-widest transition hover:bg-foreground hover:text-background"
          >
            Launch app →
          </a>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-16">
        <p className="spec">{"// nebu archive — bnb smart chain"}</p>
        <h1 className="mt-6 max-w-4xl font-mono text-5xl leading-tight font-bold sm:text-6xl">
          Agents that work your positions
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Rebalancing, grid trading, yield routing and liquidation defence. Each one reads BNB Smart
          Chain live, shows the data it decided from, and hands you the exact transactions. You sign
          them.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={APP_URL}
            className="bg-foreground px-6 py-3 font-mono text-sm font-bold text-background transition hover:opacity-90"
          >
            Open the marketplace
          </a>
          <a
            href="https://github.com/FjrREPO/nebu"
            className="border border-line px-6 py-3 font-mono text-sm transition hover:border-foreground"
          >
            Read the source
          </a>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-16">
        <Frame className="grid grid-cols-2 md:grid-cols-4">
          {counters.map((counter) => (
            <div key={counter.label} className="p-6">
              <p className="spec">{counter.label}</p>
              <p className="mt-2 font-mono text-2xl font-bold">{counter.value}</p>
            </div>
          ))}
        </Frame>
        <p className="spec mt-3">
          {head ? `read at bsc block ${head}` : "chain feed unreachable right now"}
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <h2 className="font-mono text-2xl font-bold">The units</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {plugins.map((plugin) => (
            <Frame key={plugin.id} className="flex flex-col">
              <div className="flex flex-1 flex-col gap-6 p-6">
                <div className="flex items-start justify-between gap-4">
                  <p className="spec">{"// agent"}</p>
                  <p className="spec">{plugin.category}</p>
                </div>
                <p className="py-6 text-center font-mono text-4xl text-muted">
                  {GLYPH[plugin.category] ?? "( )"}
                </p>
                <div>
                  <p className="font-mono text-lg font-bold text-accent">{plugin.name}</p>
                  <p className="mt-2 text-sm text-muted">{plugin.summary}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-line">
                <div className="p-4">
                  <p className="spec">venue</p>
                  <p className="mt-1 font-mono text-xs">{plugin.protocol}</p>
                </div>
                <div className="p-4">
                  <p className="spec">chain</p>
                  <p className="mt-1 font-mono text-xs">bsc {plugin.chainId}</p>
                </div>
              </div>
            </Frame>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <h2 className="font-mono text-2xl font-bold">How it runs</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Frame key={step.n} className="p-6">
              <p className="spec">{step.n}</p>
              <p className="mt-3 font-mono text-lg font-bold">{step.title}</p>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </Frame>
          ))}
        </div>
      </section>

      <footer className="relative border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <p className="spec">nebu · agent marketplace · bnb smart chain</p>
          <p className="spec">every figure read from mainnet at request time</p>
        </div>
      </footer>
    </main>
  );
}
