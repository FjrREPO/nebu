import { readFile } from "node:fs/promises";
import { findPlugin } from "@nebu/plugins";
import {
  restoreSession,
  runWithSession,
  type SerializedSession,
  type SessionNetwork,
} from "@nebu/session";

type Watch = { agent: string; params: Record<string, string> };

const watchlistPath = new URL("../watchlist.json", import.meta.url);

/**
 * With a session in the environment the runner stops being a monitor and
 * becomes an agent: it signs with the session key, inside the caps the wallet
 * owner granted. Without one it reports and stops, which is the safe default.
 */
function session() {
  const stored = process.env.NEBU_SESSION;
  const key = process.env.NEBU_SESSION_KEY as `0x${string}` | undefined;
  if (!stored || !key) return null;
  return {
    network: (process.env.NEBU_SESSION_NETWORK as SessionNetwork) ?? "testnet",
    session: restoreSession(JSON.parse(stored) as SerializedSession, key),
  };
}

const signing = session();

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
      if (!action) {
        console.log("  action due, but the plan came back empty");
        continue;
      }
      if (!signing) {
        console.log(`  would run: ${action.reason}`);
        continue;
      }

      console.log(`  running: ${action.reason}`);
      const result = await runWithSession(signing.network, signing.session, action.txs);
      console.log(`  ${result.status} ${result.transactionHash ?? ""}`);
    } catch (err) {
      // One bad watch entry must not take the runner down.
      console.error(`[${agent}] ${(err as Error).message.split("\n")[0]}`);
    }
  }
}

console.log(
  signing
    ? `nebu runner: signing with a session on bnb ${signing.network}`
    : "nebu runner: read-only, set NEBU_SESSION and NEBU_SESSION_KEY to let it act",
);
await tick();
setInterval(tick, Number(process.env.TICK_SECONDS ?? 60) * 1000);
