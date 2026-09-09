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
    plugins.map(
      ({ id, name, category, protocol, chainId, summary, grants, paramSchema, example }) => ({
        id,
        name,
        category,
        protocol,
        chainId,
        summary,
        grants,
        paramSchema,
        example,
      }),
    ),
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

app.get("/agents/:id/auto", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  const wallet = c.req.query("wallet");
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return c.json({ error: "wallet is required" }, 400);
  }

  try {
    // Null is an answer, not a failure: the agent has nothing to work with.
    return c.json(await plugin.autoParams(wallet as `0x${string}`));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/outlook", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    // Null either way: an agent with no view today, or one that never has one.
    return c.json(plugin.outlook ? await plugin.outlook(c.req.query()) : null);
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/deployed", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    return c.json(plugin.deployed ? await plugin.deployed(c.req.query()) : null);
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/holdings", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    return c.json(
      plugin.holdings ? await plugin.holdings(c.req.query()) : { items: [], history: [] },
    );
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/insights", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    return c.json(await plugin.insights(c.req.query()));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/agents/:id/scope", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  try {
    return c.json(await plugin.scope(c.req.query()));
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
