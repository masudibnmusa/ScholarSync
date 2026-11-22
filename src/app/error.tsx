"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A render error caught here never reaches window.onerror, so report it (no-op without a DSN).
  React.useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="mb-6 flex size-16 items-center justify-center rounded-3xl bg-destructive/12 text-destructive">
        <WarningCircle weight="duotone" className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Something went wrong on our side</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Your work is safe. Try again, and if it keeps happening check that the database is running.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button size="lg" className="mt-8" onClick={reset}>
        <ArrowsClockwise aria-hidden /> Try again
      </Button>
    </main>
  );
}
