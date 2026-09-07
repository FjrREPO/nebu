import type { AgentPlugin } from "@nebu/core";
import { pancakeRebalancer } from "@nebu/plugin-pancakeswap";

/** Every agent the marketplace can list. Add a plugin here to ship it. */
export const plugins: AgentPlugin<any>[] = [pancakeRebalancer];

export const findPlugin = (id: string) => plugins.find((p) => p.id === id);
