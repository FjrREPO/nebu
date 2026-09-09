# @nebu/telegram

The marketplace in a chat window. It imports the same registry the website
does, so anything an agent can say there it can say here.

```bash
TELEGRAM_BOT_TOKEN=… pnpm --filter @nebu/telegram start
```

| | |
|---|---|
| `/agents` | what the four agents see right now |
| `/wallet 0x…` | what each of them would do with that wallet |
| `/desk 0x…` | how the wallet splits between them |
| `/watch 0x…` | a message when an agent has work to do |
| `/unwatch` | stop |

It holds no keys and it never will. The agent wallet is a passkey on somebody's
device; hiring, signing and revoking stay on the site, and the bot links to the
page that does them. What it is good at is the part chat is good at — telling
you a health factor slipped while you were somewhere else.

The watch loop only speaks when the answer changes. A bot that repeats itself
every ten minutes gets muted, and the one message that mattered is muted with
it.

| Variable | |
|---|---|
| `TELEGRAM_BOT_TOKEN` | required, from [@BotFather](https://t.me/botfather) |
| `NEBU_SITE_URL` | where the links point, default `https://nebu.ifajar.dev` |
| `NEBU_WATCH_SECONDS` | how often the watch list is checked, default 600 |
| `NEBU_TELEGRAM_STORE` | where watches are kept, default `.nebu-telegram.json` |

To see what it would say without a token or a chat:

```bash
NEBU_TELEGRAM_DRY=0x… pnpm --filter @nebu/telegram start
```
