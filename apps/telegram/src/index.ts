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
type Watch = {
  chat: number;
  wallet: `0x${string}`;
  /** Off for a wallet that arrived from the site and only wants asking about. */
  watching?: boolean;
  said: Record<string, string>;
};
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
    return "Feeds are busy. Try again in a minute.";
  }

  const total = Number(formatEther(spendable));
  const split = allocate(entries, total);
  const named = new Map(plugins.map((plugin) => [plugin.id, plugin.name]));
  const lines = split
    .sort((a, b) => b.amount - a.amount)
    .map(
      (entry) =>
        `${entry.amount > 0 ? `<b>${pct(entry.share)}</b> · ${entry.amount.toFixed(4)} BNB` : "<b>—</b>"} · ${esc(
          named.get(entry.id) ?? entry.id,
        )}\n<i>${esc(entry.note)}</i>`,
    );

  return [
    `<b>${Number(formatEther(balance)).toFixed(4)} BNB</b> in ${wallet.slice(0, 8)}…${wallet.slice(-4)}`,
    `Blended return <b>${(blendedApr(entries, split) * 100).toFixed(1)}%</b>`,
    "",
    ...lines,
    "",
    `<a href="${SITE}/desk">Open the desk</a>`,
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
  "<b>Nebu</b>. Four agents, live on BNB Chain.",
  "",
  "/agents  how they're doing",
  "/wallet 0x…  what each would do with it",
  "/desk 0x…  how it splits between them",
  "/watch 0x…  ping you when one needs a hand",
  "/unwatch  stop",
  "",
  `Hiring is on <a href="${SITE}">the site</a>. This bot can't sign anything.`,
].join("\n");

async function handle(chat: number, text: string) {
  const [command = ""] = text.trim().split(/\s+/);
  const wallet = address(text);

  if (command.startsWith("/start") || command.startsWith("/help")) {
    // The site links here with the agent wallet in the payload, so nobody has
    // to copy an address into a chat to ask about their own money.
    if (wallet) {
      const kept = watches.find((entry) => entry.chat === chat);
      if (kept) kept.wallet = wallet;
      else watches.push({ chat, wallet, watching: false, said: {} });
      remember();
      await send(
        chat,
        `Got it, ${wallet.slice(0, 8)}…${wallet.slice(-4)}. /desk and /wallet work without the address now, and /watch turns on alerts.`,
      );
    }
    return send(chat, HELP);
  }

  if (command.startsWith("/agents")) return send(chat, await agentsMessage());

  if (command.startsWith("/desk") || command.startsWith("/wallet")) {
    const known = wallet ?? watches.find((entry) => entry.chat === chat)?.wallet;
    if (!known) {
      return send(chat, `Needs an address: <code>${command} 0x…</code>`);
    }
    await send(chat, "One sec.");
    return send(
      chat,
      command.startsWith("/desk") ? await deskMessage(known) : await walletMessage(known),
    );
  }

  if (command.startsWith("/unwatch")) {
    const before = watches.length;
    watches = watches.filter((entry) => entry.chat !== chat);
    remember();
    return send(chat, before === watches.length ? "Nothing to stop." : "Done.");
  }

  if (command.startsWith("/watch")) {
    if (!wallet) return send(chat, "Needs an address: <code>/watch 0x…</code>");
    watches = watches.filter((entry) => entry.chat !== chat);
    watches.push({ chat, wallet, watching: true, said: {} });
    remember();
    return send(
      chat,
      `Watching ${wallet.slice(0, 8)}…${wallet.slice(-4)}. You'll hear from me when something needs doing, not before.`,
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
    // An address the site handed over is for asking about, not for alerts,
    // until somebody says /watch. Older entries predate the flag and were all
    // put there by /watch.
    if (entry.watching === false) continue;
    try {
      const read = await readWallet(entry.wallet);
      for (const row of read) {
        if (!row.status?.actionable) {
          delete entry.said[row.plugin.id];
          continue;
        }
        // Somebody who said /unwatch while this was reading should not get one
        // last message about it.
        if (!watches.includes(entry)) break;
        const said = line(row.status);
        if (entry.said[row.plugin.id] === said) continue;
        entry.said[row.plugin.id] = said;
        await send(
          entry.chat,
          `⚑ <b>${esc(row.plugin.name)}</b>\n${esc(said)}\n\n<a href="${SITE}/agents/${row.plugin.id}">Run it</a>`,
        );
      }
    } catch (err) {
      console.error(`watch ${entry.wallet}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  remember();
}

/** Chats with a command still running, so one person cannot queue a hundred. */
const busy = new Set<number>();

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const body = (await (
        await fetch(`${api}/getUpdates?timeout=50&offset=${offset}`)
      ).json()) as {
        ok?: boolean;
        description?: string;
        result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[];
      };
      // A refusal — most often a second copy of the bot polling the same token
      // — answers instantly, and looping straight back into it is a busy wait
      // against Telegram rather than a bot.
      if (body.ok === false) {
        console.error(`getUpdates: ${body.description ?? "refused"}`);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        continue;
      }
      for (const update of body.result ?? []) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text) continue;
        // The command and who asked, so the log says whether a quiet bot is
        // failing or simply not being talked to. Never the rest of the text.
        console.log(`${message.chat.id} ${message.text.trim().split(/\s+/)[0]}`);
        // Every command is a dozen chain reads, so one person holding the
        // button down would otherwise queue them all against everyone else.
        if (busy.has(message.chat.id)) {
          void send(message.chat.id, "Still working on the last one.");
          continue;
        }
        busy.add(message.chat.id);
        // One slow chain read must not hold up everyone else's messages.
        void handle(message.chat.id, message.text)
          .catch((err) => console.error(`handle: ${(err as Error).message.split("\n")[0]}`))
          .finally(() => busy.delete(message.chat.id));
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
    { command: "agents", description: "how the four are doing" },
    { command: "wallet", description: "what each would do with a wallet" },
    { command: "desk", description: "how a wallet splits between them" },
    { command: "watch", description: "ping you when one needs a hand" },
    { command: "unwatch", description: "stop" },
  ],
});
// The profile people see before they press start.
await call("setMyShortDescription", {
  short_description: "Four agents working BNB positions. Ask them anything.",
});
await call("setMyDescription", {
  description:
    "Nebu runs agents on BNB Chain: PancakeSwap ranges and grids, lending rates, loan health. " +
    "Ask what they see, what they would do with a wallet, or get a ping when one needs a hand. " +
    "Hiring stays on nebu.ifajar.dev — the bot holds no keys.",
});
console.log(`nebu telegram: up, watching ${watches.length} wallet(s), site ${SITE}`);
setInterval(() => void sweep(), WATCH_SECONDS * 1000);
await poll();
