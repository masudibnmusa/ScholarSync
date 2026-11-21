import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  // Hide the dev tools badge; compile and runtime errors still show.
  devIndicators: false,
  
  // Ignore TypeScript type-checking errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // The service worker must never be cached, or a fix to it would take days to reach phones.
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    }];
  },
};

export default nextConfig;