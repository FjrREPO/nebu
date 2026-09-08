import "server-only";
import type { AgentParams, AgentSeries, AgentStatus, ParamSpec } from "@nebu/core";
import { plugins } from "@nebu/plugins";

export { CATEGORIES, categoryLabel } from "./categories";

export type AgentMeta = {
  id: string;
  name: string;
  category: string;
  protocol: string;
  chainId: number;
  summary: string;
  grants: string[];
  paramSchema: ParamSpec[];
  example: AgentParams;
};

export type AgentCard = AgentMeta & {
  status: AgentStatus | null;
  series: AgentSeries | null;
  error: string | null;
};

const meta = (plugin: (typeof plugins)[number]): AgentMeta => ({
  id: plugin.id,
  name: plugin.name,
  category: plugin.category,
  protocol: plugin.protocol,
  chainId: plugin.chainId,
  summary: plugin.summary,
  grants: plugin.grants,
  paramSchema: plugin.paramSchema,
  example: plugin.example,
});

export const agentMeta = () => plugins.map(meta);

export const findAgentMeta = (id: string) => {
  const plugin = plugins.find((entry) => entry.id === id);
  return plugin ? meta(plugin) : null;
};

/** Cards carry a live reading, so one throttled feed must not blank the page. */
export async function agentCards(): Promise<AgentCard[]> {
  return Promise.all(
    plugins.map(async (plugin) => {
      const series = await plugin.series(plugin.example).catch(() => null);
      try {
        return {
          ...meta(plugin),
          status: await plugin.status(plugin.example),
          series,
          error: null,
        };
      } catch (err) {
        return {
          ...meta(plugin),
          status: null,
          series,
          error: (err as Error).message.split("\n")[0],
        };
      }
    }),
  );
}

export type AgentHealth = AgentMeta & {
  headline: string | null;
  error: string | null;
  /** How long the agent took to answer, which is the other half of "is it up". */
  ms: number;
};

/**
 * Whether each agent can still answer, and how fast. Only status() is called —
 * a health check that also pulled every chart would be slower than the thing
 * it is checking and would spend the market feed's budget to say so.
 */
export async function agentHealth(): Promise<AgentHealth[]> {
  return Promise.all(
    plugins.map(async (plugin) => {
      const began = Date.now();
      try {
        const status = await plugin.status(plugin.example);
        return { ...meta(plugin), headline: status.headline, error: null, ms: Date.now() - began };
      } catch (err) {
        return {
          ...meta(plugin),
          headline: null,
          error: (err as Error).message.split("\n")[0],
          ms: Date.now() - began,
        };
      }
    }),
  );
}

export async function agentDetail(id: string) {
  const plugin = plugins.find((entry) => entry.id === id);
  if (!plugin) return null;
  const [status, insights, series] = await Promise.all([
    plugin.status(plugin.example).catch(() => null),
    plugin.insights(plugin.example).catch(() => null),
    plugin.series(plugin.example).catch(() => null),
  ]);
  return { meta: meta(plugin), status, insights, series };
}
