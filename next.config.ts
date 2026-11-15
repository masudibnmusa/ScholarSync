import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  // Hide the dev tools badge; compile and runtime errors still show.
  devIndicators: false,
  
  // Ignore TypeScript type-checking errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;