import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

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

// Source maps go to Sentry only when its upload credentials are set (production deploys), so browser errors show the
// real file and line. They're deleted from the build after the upload, so the code is never served publicly.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default uploadSourceMaps
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false, // no build data to Sentry beyond the maps themselves
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;