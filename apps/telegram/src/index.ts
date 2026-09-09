/**
 * The marketplace in a chat window.
 *
 * Same registry as the website — it asks the plugins directly rather than
 * scraping the site — so anything an agent can say there it can say here. What
 * it deliberately cannot do is sign: the agent wallet is a passkey on somebody's
 * device, and a bot holding keys would be a different product with a different
 * risk. It reads, it works out the split, and it tells you when something needs
 * doing. Acting stays on the site.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  type AgentStatus,
  allocate,
  blendedApr,
  bscClient,
  type DeskAgent,
  GAS_RESERVE_WEI,
} from "@nebu/core";
import { plugins } from "@nebu/plugins";
import { formatEther } from "viem";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN && !process.env.NEBU_TELEGRAM_DRY) {
  console.error("TELEGRAM_BOT_TOKEN is required — talk to @BotFather to get one.");
  process.exit(1);
}
const SITE = process.env.NEBU_SITE_URL ?? "https://nebu.ifajar.dev";
/** How often the watch list is checked, in seconds. */
const WATCH_SECONDS = Number(process.env.NEBU_WATCH_SECONDS ?? 600);
const STORE = process.env.NEBU_TELEGRAM_STORE ?? ".nebu-telegram.json";

const api = `https://api.telegram.org/bot${TOKEN}`;

/** Telegram's HTML mode is the forgiving one; only three characters matter. */
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(method: string, body: unknown) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { ok: boolean; result?: unknown; description?: string };
}

const send = (chat: number, html: string) =>
  call("sendMessage", {
    chat_id: chat,
    text: html,
    parse_mode: "HTML",
    // A wall of previews under every message about a website is noise.
    link_preview_options: { is_disabled: true },
  });

/**
 * Who is watching what, and what they were last told.
 *
 * A flat file because that is what the data is: a handful of chat ids against a
 * handful of addresses. ponytail: swap for a real store if this ever has users
 * in the thousands, which it will not.
 */
type Watch = { chat: number; wallet: `0x${string}`; said: Record<string, string> };
let watches: Watch[] = [];
try {
  watches = JSON.parse(readFileSync(STORE, "utf8")) as Watch[];
} catch {
  // No file yet, or an unreadable one. Either way nobody is being watched.
}
const remember = () => {
  try {
    writeFileSync(STORE, JSON.stringify(watches, null, 2));
  } catch (err) {
    console.error(`could not save watches: ${(err as Error).message}`);
  }
};

const address = (text: string) =>
  (text.match(/0x[0-9a-fA-F]{40}/) ?? [])[0] as `0x${string}` | undefined;

const pct = (share: number) => `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`;

/** An agent's status as one line, since not every agent writes a detail. */
const line = (status: AgentStatus) =>
  status.detail ? `${status.headline} — ${status.detail}` : status.headline;

/** What every agent makes of one wallet, asked once and reused. */
async function readWallet(wallet: `0x${string}`) {
  return Promise.all(
    plugins.map(async (plugin) => {
      try {
        const auto = await plugin.autoParams(wallet);
        if (!auto) return { plugin, auto: null, status: null, outlook: null };
        const [status, outlook] = await Promise.all([
          plugin.status(auto.params),
          plugin.outlook?.(auto.params) ?? Promise.resolve(null),
        ]);
        return { plugin, auto, status, outlook };
      } catch (err) {
        console.error(`[${plugin.id}] ${(err as Error).message.split("\n")[0]}`);
        return { plugin, auto: null, status: null, outlook: null };
      }
    }),
  );
}

async function agentsMessage() {
  const lines = await Promise.all(
    plugins.map(async (plugin) => {
      try {
        const status = await plugin.status(plugin.example);
        return `<b>${esc(plugin.name)}</b>\n${esc(line(status))}`;
      } catch {
        return `<b>${esc(plugin.name)}</b>\nnot answering right now`;
      }
    }),
  );
  return `${lines.join("\n\n")}\n\n<a href="${SITE}/agents">Hire one</a>`;
}

async function deskMessage(wallet: `0x${string}`) {
  const balance = await bscClient.getBalance({ address: wallet }).catch(() => 0n);
  const spendable = balance > GAS_RESERVE_WEI ? balance - GAS_RESERVE_WEI : 0n;
  const read = await readWallet(wallet);

  const entries: DeskAgent[] = read.flatMap((row) =>
    row.outlook ? [{ id: row.plugin.id, outlook: row.outlook }] : [],
  );
  if (entries.length === 0) {
    return "None of the agents has a view on this wallet right now — the feeds may be busy. Try again in a minute.";
  }

  const total = Number(formatEther(spendable));
  const split = allocate(entries, total);
  const named = new Map(plugins.map((plugin) => [plugin.id, plugin.name]));
  const lines = split
    .sort((a, b) => b.amount - a.amount)
    .map(
      (entry) =>
        `${entry.amount > 0 ? `<b>${pct(entry.share)}</b> · ${entry.amount} BNB` : "<b>—</b>"} · ${esc(
          named.get(entry.id) ?? entry.id,
        )}\n<i>${esc(entry.note)}</i>`,
    );

  return [
    `<b>${Number(formatEther(balance)).toFixed(4)} BNB</b> in ${wallet.slice(0, 8)}…${wallet.slice(-4)}`,
    `Blended return <b>${(blendedApr(entries, split) * 100).toFixed(1)}%</b>`,
    "",
    ...lines,
    "",
    `<a href="${SITE}/desk">The whole desk</a>`,
  ].join("\n");
}

async function walletMessage(wallet: `0x${string}`) {
  const read = await readWallet(wallet);
  const lines = read.map((row) =>
    row.status
      ? `<b>${esc(row.plugin.name)}</b>\n${row.status.actionable ? "⚑ " : ""}${esc(line(row.status))}`
      : `<b>${esc(row.plugin.name)}</b>\nnothing to work with here`,
  );
  return `${lines.join("\n\n")}\n\n<a href="${SITE}/wallet">Fund it</a>`;
}

const HELP = [
  "<b>Nebu</b> — agents that manage BNB positions.",
  "",
  "/agents — what the four agents see right now",
  "/wallet &lt;address&gt; — what each would do with that wallet",
  "/desk &lt;address&gt; — how the wallet splits between them",
  "/watch &lt;address&gt; — tell me when one of them needs to act",
  "/unwatch — stop",
  "",
  `Hiring and signing happen on <a href="${SITE}">the site</a>: the agent wallet is a passkey on your device, and this bot holds no keys.`,
].join("\n");

async function handle(chat: number, text: string) {
  const [command = ""] = text.trim().split(/\s+/);
  const wallet = address(text);

  if (command.startsWith("/start") || command.startsWith("/help")) return send(chat, HELP);

  if (command.startsWith("/agents")) return send(chat, await agentsMessage());

  if (command.startsWith("/desk") || command.startsWith("/wallet")) {
    const known = wallet ?? watches.find((entry) => entry.chat === chat)?.wallet;
    if (!known) {
      return send(chat, `Give me an address: <code>${command} 0x…</code>`);
    }
    await send(chat, "Reading the chain…");
    return send(
      chat,
      command.startsWith("/desk") ? await deskMessage(known) : await walletMessage(known),
    );
  }

  if (command.startsWith("/unwatch")) {
    const before = watches.length;
    watches = watches.filter((entry) => entry.chat !== chat);
    remember();
    return send(chat, before === watches.length ? "You were not watching anything." : "Stopped.");
  }

  if (command.startsWith("/watch")) {
    if (!wallet) return send(chat, "Give me an address: <code>/watch 0x…</code>");
    watches = watches.filter((entry) => entry.chat !== chat);
    watches.push({ chat, wallet, said: {} });
    remember();
    return send(
      chat,
      `Watching ${wallet.slice(0, 8)}…${wallet.slice(-4)}. I will say something when an agent has work to do — about every ${Math.round(WATCH_SECONDS / 60)} minutes, and only when the answer changes.`,
    );
  }

  return send(chat, HELP);
}

/**
 * The watch loop only speaks when something changed.
 *
 * A bot that repeats "health factor 1.4" every ten minutes gets muted, and then
 * the one message that mattered is muted with it.
 */
async function sweep() {
  for (const entry of watches) {
    try {
      const read = await readWallet(entry.wallet);
      for (const row of read) {
        if (!row.status?.actionable) {
          delete entry.said[row.plugin.id];
          continue;
        }
        const said = line(row.status);
        if (entry.said[row.plugin.id] === said) continue;
        entry.said[row.plugin.id] = said;
        await send(
          entry.chat,
          `⚑ <b>${esc(row.plugin.name)}</b>\n${esc(said)}\n\n<a href="${SITE}/agents/${row.plugin.id}">Let it run</a>`,
        );
      }
    } catch (err) {
      console.error(`watch ${entry.wallet}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  remember();
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const body = (await (
        await fetch(`${api}/getUpdates?timeout=50&offset=${offset}`)
      ).json()) as {
        result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[];
      };
      for (const update of body.result ?? []) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text) continue;
        // One slow chain read must not hold up everyone else's messages.
        void handle(message.chat.id, message.text).catch((err) =>
          console.error(`handle: ${(err as Error).message.split("\n")[0]}`),
        );
      }
    } catch (err) {
      // Telegram drops long polls, networks blink. Neither ends the bot.
      console.error(`poll: ${(err as Error).message.split("\n")[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

/**
 * Print what the bot would say and stop, so the messages can be checked
 * against a real wallet without a token, a chat, or anyone's phone.
 */
const dry = process.env.NEBU_TELEGRAM_DRY as `0x${string}` | undefined;
if (dry) {
  console.log(await agentsMessage(), "\n\n---\n");
  console.log(await walletMessage(dry), "\n\n---\n");
  console.log(await deskMessage(dry));
  process.exit(0);
}

await call("setMyCommands", {
  commands: [
    { command: "agents", description: "what the agents see right now" },
    { command: "wallet", description: "what each agent would do with a wallet" },
    { command: "desk", description: "how a wallet splits between them" },
    { command: "watch", description: "get told when an agent needs to act" },
    { command: "unwatch", description: "stop watching" },
  ],
});
console.log(`nebu telegram: up, watching ${watches.length} wallet(s), site ${SITE}`);
setInterval(() => void sweep(), WATCH_SECONDS * 1000);
await poll();
