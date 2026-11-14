import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  
  // Ignore TypeScript type-checking errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;