/**
 * Warm the market feed before anybody asks it for anything.
 *
 * Every reading on this site comes through one queue that spaces requests two
 * seconds apart, because that is what the feed allows. A page that needs a
 * dozen of them therefore takes half a minute on a cold container, and the
 * first person through the door pays for all of it — the portfolio sat at "…"
 * for forty seconds while the queue worked through pools and prices that every
 * other visitor would have shared.
 *
 * So the container fetches the shared half itself, on boot and every few
 * minutes after. What is left when somebody arrives is their own wallet, which
 * is chain reads and fast.
 */
export async function register() {
  // Only the Node server has the cache these fill, and a build should not be
  // making network calls on its own account.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const [{ bnbUsd }, { livePools }, { plugins }] = await Promise.all([
    import("@nebu/core"),
    import("@nebu/plugin-pancakeswap"),
    import("@nebu/plugins"),
  ]);

  // A wallet holding nothing, which is all these need: an agent choosing what
  // it would do reads the screen and the prices, not the account. Those are
  // the slow parts, and they are the same for everybody.
  const NOBODY = "0x0000000000000000000000000000000000000000" as const;

  const warm = async () => {
    const done = await Promise.allSettled([
      livePools(),
      bnbUsd(),
      ...plugins.map((plugin) => plugin.autoParams(NOBODY)),
    ]);
    const failed = done.filter((result) => result.status === "rejected").length;
    if (failed) console.warn(`warm: ${failed} of ${done.length} reads declined`);
  };

  // Not awaited: the server should start serving now, not after the feed says
  // hello.
  void warm();
  setInterval(() => void warm(), 5 * 60_000);
}
