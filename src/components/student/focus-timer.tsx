"use client";

import * as React from "react";
import { Play, Stop, Timer } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { logFocus } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import type { KanbanTask } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale";

export const FOCUS_MINUTES = 25;
const KEY = "scholarsync:focus";
type Running = { taskId: string; teamId: string; title: string; startedAt: number };

// The running timer lives in localStorage, so it survives closing the dialog, a reload and other tabs.
let current: Running | null | undefined; // undefined = not read yet
const listeners = new Set<() => void>();
function read(): Running | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
function write(r: Running | null) {
  current = r;
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); } catch { /* private mode: this tab only */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { current = read(); l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}
const snapshot = () => (current === undefined ? (current = read()) : current);
export const useFocus = () => React.useSyncExternalStore(subscribe, snapshot, () => null);

/** "25 min", "1 h 5 min" */
export function useMinutes() {
  const { t } = useT();
  return (n: number) => (n < 60 ? t("{n} min", { n }) : t("{h} h {m} min", { h: Math.floor(n / 60), m: n % 60 }));
}

/** Ends the session and saves the whole minutes spent (up to 25). Shared by Stop, the timer running out, and starting another. */
async function finish(r: Running, done: boolean, say: (minutes: number) => string) {
  write(null);
  const minutes = Math.min(FOCUS_MINUTES, Math.floor((Date.now() - r.startedAt) / 60_000));
  if (minutes < 1) return;
  try {
    await logFocus(r.taskId, minutes);
    if (done) toast.success(say(minutes));
    await useAppStore.getState().fetchTasks(r.teamId);
  } catch (err) {
    console.error("Saving the focus session failed:", err); // usually an overlap from a second tab finishing too
  }
}

/** In the task dialog: start a 25-minute focus on this task, and the team's total so far. */
export function FocusButton({ task, teamId, disabled }: { task: KanbanTask; teamId: string; disabled?: boolean }) {
  const { t } = useT();
  const running = useFocus();
  const minutes = useMinutes();
  const here = running?.taskId === task.id;
  return (
    <section aria-labelledby="task-focus-title" className="flex flex-wrap items-center gap-3 border-t pt-4">
      <h3 id="task-focus-title" className="flex items-center gap-1.5 text-sm font-bold">
        <Timer weight="duotone" className="size-4 text-primary" aria-hidden /> {t("Focus")}
      </h3>
      <span className="text-sm text-muted-foreground">
        {task.focusMinutes ? t("{time} spent so far", { time: minutes(task.focusMinutes) }) : t("No focus time yet")}
      </span>
      {!disabled && !here && (
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={async () => {
          if (running) await finish(running, false, () => "");
          write({ taskId: task.id, teamId, title: task.title, startedAt: Date.now() });
        }}>
          <Play weight="fill" aria-hidden /> {t("Focus for {n} minutes", { n: FOCUS_MINUTES })}
        </Button>
      )}
      {here && <span className="ml-auto text-sm font-semibold text-primary">{t("Timer running")}</span>}
    </section>
  );
}

/** The running timer, beside the board's filters: time left and Stop. Saves the session when the time is up. */
export function FocusTimer() {
  const { t } = useT();
  const running = useFocus();
  const minutes = useMinutes();
  const [now, setNow] = React.useState(() => Date.now());
  const say = React.useCallback((n: number) => t("Focus session saved: {time} on {title}", { time: minutes(n), title: running?.title ?? "" }), [t, minutes, running]);

  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() - running.startedAt >= FOCUS_MINUTES * 60_000) finish(running, true, say);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, say]);

  if (!running) return null;
  const left = Math.max(0, FOCUS_MINUTES * 60 - Math.floor((now - running.startedAt) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm" role="group" aria-label={t("Focus timer")}>
      <Timer weight="fill" className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 max-w-40 truncate font-semibold">{running.title}</span>
      <span className="font-bold tabular-nums text-primary" aria-label={t("{clock} left", { clock })}>{clock}</span>
      <Button size="sm" variant="ghost" className="h-7 rounded-full px-2" onClick={() => finish(running, true, say)}>
        <Stop weight="fill" aria-hidden /> {t("Stop")}
      </Button>
    </div>
  );
}
