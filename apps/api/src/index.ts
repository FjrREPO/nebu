import { serve } from "@hono/node-server";
import { InvalidParams } from "@nebu/core";
import { findPlugin, plugins } from "@nebu/plugins";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("/*", cors());

/** Bad params are the caller's fault; anything else means the chain read failed. */
function fail(c: Context, err: unknown) {
  const message = (err as Error).message.split("\n")[0];
  return err instanceof InvalidParams
    ? c.json({ error: message }, 400)
    : c.json({ error: message }, 502);
}

app.get("/health", (c) => c.json({ ok: true, agents: plugins.length }));

app.get("/agents", (c) =>
  c.json(
    plugins.map(({ id, name, category, protocol, chainId, summary, paramSchema }) => ({
      id,
      name,
      category,
      protocol,
      chainId,
      summary,
      paramSchema,
    })),
  ),
);

app.get("/agents/:id/status", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    return c.json(await plugin.status(c.req.query()));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/plan", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    const action = await plugin.plan(c.req.query());
    if (!action) return c.json({ action: null, reason: "nothing to do right now" });
    // bigint does not survive JSON, and a tx value has to reach the wallet intact.
    return c.json({
      action: {
        reason: action.reason,
        txs: action.txs.map((tx) => ({ ...tx, value: (tx.value ?? 0n).toString() })),
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`nebu api on :${port}`);
