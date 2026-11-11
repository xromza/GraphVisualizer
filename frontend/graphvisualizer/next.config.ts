import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  experimental: {
    optimizePackageImports: ['react', 'react-dom'],
  },
};

export default nextConfig;
