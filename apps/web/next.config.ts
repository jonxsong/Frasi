import type { NextConfig } from "next";
import path from "node:path";

const siteExport = process.env.FRASI_SITE_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: siteExport ? "export" : "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: siteExport ? { unoptimized: true } : undefined,
  transpilePackages: ["@frasi/music-core", "@frasi/shared-types"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
      };
    }
    return config;
  },
};

export default nextConfig;
