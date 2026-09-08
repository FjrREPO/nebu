import { plugins } from "@nebu/plugins";
import {
  restoreSession,
  runWithSession,
  type SerializedSession,
  type SessionNetwork,
} from "@nebu/session";

/**
 * The headless side of the marketplace: point it at a wallet and it asks every
 * agent what it would do with what is in there.
 *
 * Nothing is configured per agent. Each one reads its own screen, picks its own
 * venue and sizes its own move — the runner only decides how often to ask and
 * whether it is allowed to sign.
 */
const wallet = process.env.NEBU_WALLET as `0x${string}` | undefined;
if (!wallet) {
  console.error("NEBU_WALLET is required — the address the agents should work.");
  process.exit(1);
}

/**
 * With a session in the environment the runner stops being a monitor and
 * becomes an agent: it signs with the session key, inside the caps the wallet
 * owner granted. Without one it reports and stops, which is the safe default.
 */
function signer() {
  const stored = process.env.NEBU_SESSION;
  const key = process.env.NEBU_SESSION_KEY as `0x${string}` | undefined;
  if (!stored || !key) return null;
  // The agents' calldata names BNB Smart Chain contracts, so that is where a
  // session has to live. Testnet is available for plugins that name testnet
  // addresses, and is not the default because the plugins here do not.
  const network: SessionNetwork =
    process.env.NEBU_SESSION_NETWORK === "testnet" ? "testnet" : "mainnet";
  return {
    network,
    session: restoreSession(JSON.parse(stored) as SerializedSession, key),
  };
}

/** Chain ids by session network, to check an agent against the one signing. */
const CHAIN_OF: Record<SessionNetwork, number> = { mainnet: 56, testnet: 97 };

const signing = signer();

async function tick() {
  console.log(`\n--- ${new Date().toISOString()} · ${wallet} ---`);

  for (const plugin of plugins) {
    try {
      const auto = await plugin.autoParams(wallet as `0x${string}`);
      if (!auto) {
        console.log(`[${plugin.id}] nothing to work with`);
        continue;
      }

      const status = await plugin.status(auto.params);
      console.log(`[${plugin.id}] ${status.headline}`);
      console.log(`  chose: ${auto.reason}`);
      if (!status.actionable) continue;

      const action = await plugin.plan(auto.params);
      if (!action) {
        console.log("  action due, but the plan came back empty");
        continue;
      }
      if (!signing) {
        console.log(`  would run (${action.txs.length} tx): ${action.reason}`);
        continue;
      }

      // A call to an address with no code succeeds rather than reverting, so
      // signing an agent's calldata on the wrong chain would report a hash for
      // something that never happened.
      if (plugin.chainId !== CHAIN_OF[signing.network]) {
        console.log(
          `  would run (${action.txs.length} tx), but this agent is for chain ${plugin.chainId} ` +
            `and the session is on bnb ${signing.network}. Not signing.`,
        );
        continue;
      }
      console.log(`  running (${action.txs.length} tx): ${action.reason}`);
      const result = await runWithSession(signing.network, signing.session, action.txs);
      console.log(`  ${result.status} ${result.transactionHash ?? ""}`);
    } catch (err) {
      // One agent having a bad minute must not take the runner down.
      console.error(`[${plugin.id}] ${(err as Error).message.split("\n")[0]}`);
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
