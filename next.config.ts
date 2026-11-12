import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the build produces a plain out/ directory that can be
  // uploaded to OSS and served from CDN with no Node runtime.
  output: "export",
  // Directory-style output (posts/index.html) so OSS serves /posts/ without a
  // server-side rewrite.
  trailingSlash: true,
  images: {
    // No Next image optimizer in a static export; images are plain <img>.
    unoptimized: true,
  },
};

export default nextConfig;
