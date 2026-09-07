import type { AgentPlugin } from "@nebu/core";
import { healthMonitor, yieldOptimizer } from "@nebu/plugin-lending";
import { pancakeGrid, pancakeRebalancer } from "@nebu/plugin-pancakeswap";

/**
 * Every agent the marketplace lists, one per category. Add a plugin here to
 * ship it — nothing else in the stack needs to know it exists.
 */
export const plugins: AgentPlugin[] = [
  pancakeRebalancer,
  pancakeGrid,
  yieldOptimizer,
  healthMonitor,
];

export const findPlugin = (id: string) => plugins.find((p) => p.id === id);
