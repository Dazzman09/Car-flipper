import type { NextConfig } from "next";

/**
 * Set PAGES_BASE_PATH (e.g. "/Car-flipper") to build a static export for
 * GitHub Pages. Without it the app builds normally for `next start`.
 */
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath
    ? {
        output: "export",
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
