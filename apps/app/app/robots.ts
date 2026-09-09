import type { MetadataRoute } from "next";
import { SITE, TESTNET } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // The sandbox is the same site word for word. Indexed, it would compete with
  // the real one for its own name.
  if (TESTNET) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // Nothing here is private, but the API answers JSON that reads as
    // duplicate content and the agent actions are POST-only anyway.
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: new URL("/sitemap.xml", SITE).href,
  };
}
