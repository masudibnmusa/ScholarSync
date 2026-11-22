// Error monitoring with Sentry, shared by the server, edge and browser setups. Off unless NEXT_PUBLIC_SENTRY_DSN is
// set (a DSN is not a secret: browsers need it). No personal data is sent: no IPs, cookies or emails, only user ids.
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/**
 * Drops input the app rejects on purpose (zod validation), and strips what could identify a person: request headers
 * and cookies, query strings, and any user field but the id (the server SDK adds the IP address on its own).
 */
export function scrub(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const err = hint?.originalException as { name?: string } | undefined;
  if (err?.name === "ZodError") return null;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    delete event.request.data;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  event.user = event.user?.id ? { id: event.user.id } : undefined;
  return event;
}

export const sentryOptions = {
  dsn: SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0, // errors only
  beforeSend: scrub,
};
