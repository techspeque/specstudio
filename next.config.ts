import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Using server mode instead of static export to keep API routes
  // working for web dev mode. Electron uses IPC handlers directly.

  // Disable image optimization for Electron compatibility
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
