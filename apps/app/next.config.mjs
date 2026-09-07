/** @type {import('next').NextConfig} */
const nextConfig = {
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
  // The workspace packages ship TypeScript source, not a build.
  transpilePackages: [
    "@nebu/core",
    "@nebu/plugins",
    "@nebu/plugin-pancakeswap",
    "@nebu/plugin-lending",
  ],
};

export default nextConfig;
