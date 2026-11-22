import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, sentryOptions } from "@/lib/monitoring";

// Browser error reporting (uncaught errors and rejections). See src/lib/monitoring.ts.
if (SENTRY_DSN) Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
