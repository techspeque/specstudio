import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri - all backend logic is in Rust
  output: "export",

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
