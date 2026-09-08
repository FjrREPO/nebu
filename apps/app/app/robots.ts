import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Nothing here is private, but the API answers JSON that reads as
    // duplicate content and the agent actions are POST-only anyway.
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: new URL("/sitemap.xml", SITE).href,
  };
}
