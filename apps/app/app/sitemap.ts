import type { MetadataRoute } from "next";
import { agentMeta } from "@/lib/agents";
import { SITE, TESTNET } from "@/lib/site";

const at = (path: string) => new URL(path, SITE).href;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: at("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: at("/agents"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: at("/leaderboard"), lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: at("/wallet"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: at("/desk"), lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: at("/status"), lastModified: now, changeFrequency: "hourly", priority: 0.3 },
    ...(TESTNET
      ? [
          {
            url: at("/faucet"),
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.4,
          },
        ]
      : []),
    ...agentMeta().map((agent) => ({
      url: at(`/agents/${agent.id}`),
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
  ];
}
