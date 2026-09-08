import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone traces only the files the server actually needs, which for a
  // workspace means tracing from the repo root, not this package.
  output: "standalone",
  // A page is a live read behind a feed that rations requests, and the build
  // deliberately waits rather than shipping a blank chart. Sixty seconds is
  // not enough room for that patience.
  staticPageGenerationTimeout: 300,
  experimental: {
    // Every page reads the same live feeds behind a one-minute cache that lives
    // in module state, so it only holds inside one process. Ten build workers
    // meant ten copies asking at once and the feed refusing most of them.
    cpus: 1,
  },
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
