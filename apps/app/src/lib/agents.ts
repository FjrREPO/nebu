import "server-only";
import { plugins } from "@nebu/plugins";
import type { AgentCardData, AgentMeta } from "./types";

export function agentMeta(): AgentMeta[] {
  return plugins.map(
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
  );
}

export function findAgentMeta(id: string) {
  return agentMeta().find((agent) => agent.id === id) ?? null;
}

/**
 * The marketplace shows live numbers on first paint, so every card is read from
 * chain here. One slow or throttled agent must not blank the whole page.
 */
export async function agentCards(): Promise<AgentCardData[]> {
  return Promise.all(
    plugins.map(async (plugin) => {
      const meta = agentMeta().find((agent) => agent.id === plugin.id) as AgentMeta;
      try {
        return { ...meta, status: await plugin.status(plugin.example), error: null };
      } catch (err) {
        return { ...meta, status: null, error: (err as Error).message.split("\n")[0] };
      }
    }),
  );
}

/** The detail page opens with real numbers instead of an empty form. */
export async function exampleStatus(id: string) {
  const plugin = plugins.find((entry) => entry.id === id);
  if (!plugin) return null;
  return plugin.status(plugin.example).catch(() => null);
}

/** The agent's own working data for its detail page. */
export async function agentInsights(id: string) {
  const plugin = plugins.find((entry) => entry.id === id);
  if (!plugin) return null;
  return plugin.insights(plugin.example).catch(() => null);
}
