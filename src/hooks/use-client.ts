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

const STORAGE_EVENT = "scholarsync:storage";

/** localStorage-backed state, kept in sync across components and tabs. Falls back quietly if storage is blocked. */
export function useStoredValue<T>(key: string | null, fallback: T): [T, (value: T) => void] {
  const subscribe = React.useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(STORAGE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(STORAGE_EVENT, notify);
    };
  }, []);
  const raw = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        return key ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  const value = React.useMemo<T>(() => {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw]);
  const set = React.useCallback((next: T) => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* storage blocked: the change lasts until reload */ }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, [key]);
  return [value, set];
}
