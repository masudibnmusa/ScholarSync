"use client";

import * as React from "react";

const noop = () => () => {};

/**
 * A value that only exists in the browser (clock, user agent, …). Renders `server` during SSR and
 * hydration, then the real value, without a hydration mismatch or a setState-in-effect.
 * `read` must return the same value between renders unless it really changed.
 */
export function useClientValue<T>(read: () => T, server: T): T {
  return React.useSyncExternalStore(noop, read, () => server);
}

export const useMounted = () => useClientValue(() => true, false);
