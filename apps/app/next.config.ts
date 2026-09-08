import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
