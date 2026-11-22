import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, sentryOptions } from "@/lib/monitoring";

// Server and edge (the proxy) error reporting. See src/lib/monitoring.ts.
export function register() {
  if (SENTRY_DSN) Sentry.init(sentryOptions);
}

// Errors in pages, route handlers, Server Actions and the proxy.
export const onRequestError = Sentry.captureRequestError;
