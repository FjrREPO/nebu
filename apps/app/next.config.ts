import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone traces only the files the server actually needs, which for a
  // workspace means tracing from the repo root, not this package.
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  // The workspace packages ship TypeScript source, not a build.
  transpilePackages: [
    "@nebu/core",
    "@nebu/plugins",
    "@nebu/plugin-pancakeswap",
    "@nebu/plugin-lending",
    "@nebu/session",
  ],
};

export default nextConfig;
