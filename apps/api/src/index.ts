import { serve } from "@hono/node-server";
import { plugins, findPlugin } from "@nebu/plugins";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("/*", cors());

app.get("/agents", (c) =>
  c.json(
    plugins.map(({ id, name, category, protocol, chainId, paramSchema }) => ({
      id,
      name,
      category,
      protocol,
      chainId,
      paramSchema,
    })),
  ),
);

app.get("/agents/:id/status", async (c) => {
  const plugin = findPlugin(c.req.param("id"));
  if (!plugin) return c.json({ error: "unknown agent" }, 404);

  const params = c.req.query();
  const missing = plugin.paramSchema.filter((p) => !params[p.key]).map((p) => p.key);
  if (missing.length) return c.json({ error: `missing params: ${missing.join(", ")}` }, 400);

  try {
    return c.json(await plugin.status(params));
  } catch (err) {
    // Bad address, unreachable RPC, wrong pool — the caller's problem, not a crash.
    return c.json({ error: (err as Error).message }, 502);
  }
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`nebu api on :${port}`);
