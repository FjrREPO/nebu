import { readFile } from "node:fs/promises";
import { findPlugin } from "@nebu/plugins";

type Watch = { agent: string; params: Record<string, string> };

const watchlistPath = new URL("../watchlist.json", import.meta.url);

async function tick() {
  const watchlist: Watch[] = JSON.parse(await readFile(watchlistPath, "utf8"));

  for (const { agent, params } of watchlist) {
    const plugin = findPlugin(agent);
    if (!plugin) {
      console.error(`[${agent}] not in the registry`);
      continue;
    }
    try {
      const status = await plugin.status(params);
      console.log(`[${agent}] ${status.headline} — ${status.detail ?? ""}`);
      if (!status.actionable) continue;

      const action = await plugin.plan(params);
      // ponytail: log-only runner. Signing goes through an Altana session-key
      // wallet with spend limits — that is the bounty requirement, not a default.
      console.log(
        action ? `  would run: ${action.reason}` : "  action due, plan() not implemented",
      );
    } catch (err) {
      // One bad watch entry must not take the runner down.
      console.error(`[${agent}] ${(err as Error).message}`);
    }
  }
}

await tick();
setInterval(tick, Number(process.env.TICK_SECONDS ?? 60) * 1000);
