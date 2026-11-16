import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@frasi/music-core", "@frasi/shared-types"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
