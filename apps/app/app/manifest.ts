import type { MetadataRoute } from "next";
import { TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nebu — autonomous DeFi agents for BNB Smart Chain",
    short_name: "Nebu",
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    // The site is black everywhere, so an installed window should be too.
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
