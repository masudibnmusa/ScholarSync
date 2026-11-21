"use client";

// Offline support: the last data each screen loaded (per user, in localStorage) and an outbox for chat messages
// typed while offline. The service worker (public/sw.js) keeps the pages themselves. Signing out wipes both.

const PREFIX = "ss-offline:";
const OUTBOX = "ss-outbox:";

export interface QueuedMessage {
  key: string;
  teamId: string;
  content: string;
  replyTo?: string;
  at: string;
}

/** True when an error means "couldn't reach the server" rather than "the server said no". */
export const isOffline = (err?: unknown) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || (err instanceof TypeError && /fetch|network|load failed/i.test(err.message));

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {} // full or blocked: offline copies are a convenience
}

export const saveSnapshot = (uid: string, key: string, value: unknown) => write(`${PREFIX}${uid}:${key}`, value);
export const loadSnapshot = <T,>(uid: string, key: string) => read<T>(`${PREFIX}${uid}:${key}`);

/**
 * Runs a load; saves what it returns for next time. If the server can't be reached, returns the last saved copy
 * (or rethrows when there is none). `keep` trims what is saved. Server errors (access denied, bad input) always rethrow.
 */
export async function withSnapshot<T>(uid: string | undefined, key: string, load: () => Promise<T>, keep: (v: T) => T = (v) => v): Promise<T> {
  try {
    const value = await load();
    if (uid) saveSnapshot(uid, key, keep(value));
    return value;
  } catch (err) {
    const saved = uid && isOffline(err) ? loadSnapshot<T>(uid, key) : undefined;
    if (saved === undefined) throw err;
    return saved;
  }
}

export const outbox = (uid: string) => read<QueuedMessage[]>(`${OUTBOX}${uid}`) ?? [];
export function queueMessage(uid: string, m: Omit<QueuedMessage, "key" | "at">): QueuedMessage {
  const q = { ...m, key: crypto.randomUUID(), at: new Date().toISOString() };
  write(`${OUTBOX}${uid}`, [...outbox(uid), q]);
  return q;
}
const dropQueued = (uid: string, key: string) => write(`${OUTBOX}${uid}`, outbox(uid).filter((m) => m.key !== key));

/**
 * Sends queued messages in order, stopping at the first that can't reach the server (it stays queued). A Web Lock
 * keeps two open tabs from sending the same message twice. Returns the teams that got messages, and any the server
 * refused (e.g. removed from the team meanwhile), so the writer can be shown their text.
 */
export async function flushOutbox(uid: string, send: (m: QueuedMessage) => Promise<void>) {
  const run = async () => {
    const teams = new Set<string>();
    const refused: QueuedMessage[] = [];
    for (const m of outbox(uid)) { // re-read inside the lock: another tab may have sent some
      try {
        await send(m);
        teams.add(m.teamId);
      } catch (err) {
        if (isOffline(err)) break;
        console.error("A queued message was refused:", err);
        refused.push(m);
      }
      dropQueued(uid, m.key);
    }
    return { teams: [...teams], refused };
  };
  return typeof navigator.locks?.request === "function" ? navigator.locks.request(`${OUTBOX}${uid}`, run) : run();
}

/** Signing out: forget every offline copy on this device (another person may use it next). */
export async function clearOffline() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith(OUTBOX)) localStorage.removeItem(k);
  } catch {}
  try {
    for (const k of await caches.keys()) if (k.startsWith("ss-offline-")) await caches.delete(k);
  } catch {}
}
