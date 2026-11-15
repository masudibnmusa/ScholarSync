"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ChartLineUp, ChatsCircle, Check, CheckCircle, Flag, Kanban, Sparkle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

const tabs = [
  { id: "board", label: "Board", icon: Kanban, caption: "Drag tasks from to-do to done. Everyone sees it move." },
  { id: "chat", label: "Chat", icon: ChatsCircle, caption: "Talk in one place. AI turns promises into tasks." },
  { id: "insights", label: "Insights", icon: ChartLineUp, caption: "Faculty see progress and health for every team." },
] as const;
type TabId = (typeof tabs)[number]["id"];
const TAB_MS = 7000;

/** Counts 0 → `steps`, one tick every `ms`, then holds. Each demo remounts when its tab is shown, which restarts it. */
function useSteps(steps: number, ms: number) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s >= steps ? s : s + 1)), ms);
    return () => clearInterval(t);
  }, [steps, ms, reduce]);
  return reduce ? steps : step; // no motion: show the finished state
}

// ─── Board ───────────────────────────────────────────────────────────────

const boardTasks = [
  { id: "a", title: "Design database schema", who: "Nazmul Hasan", priority: "High", path: ["progress", "progress", "done", "done"] },
  { id: "b", title: "Build event list page", who: "Masud Musa", priority: "Medium", path: ["todo", "progress", "progress", "progress"] },
  { id: "c", title: "Write integration tests", who: "Chinmoy Kumar", priority: "Medium", path: ["todo", "todo", "todo", "progress"] },
  { id: "d", title: "Set up the repo and CI", who: "Masud Musa", priority: "High", path: ["done", "done", "done", "done"] },
  { id: "e", title: "Prepare demo slides", who: "Nazmul Hasan", priority: "Low", path: ["todo", "todo", "todo", "todo"] },
];
const boardCols = [
  { id: "todo", label: "To do", dot: "bg-muted-foreground" },
  { id: "progress", label: "In progress", dot: "bg-warm" },
  { id: "done", label: "Done", dot: "bg-success" },
];

function BoardDemo() {
  const step = useSteps(3, 1500);
  return (
    <LayoutGroup>
      <div className="grid h-full grid-cols-3 gap-2.5 sm:gap-3">
        {boardCols.map((col) => {
          const list = boardTasks.filter((t) => t.path[step] === col.id);
          return (
            <div key={col.id} className="flex min-w-0 flex-col rounded-2xl bg-muted/60 p-2 sm:p-2.5">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[0.6875rem] font-extrabold sm:text-xs">
                <span className={cn("size-2 rounded-full", col.dot)} />
                <span className="truncate">{col.label}</span>
                <span className="ml-auto rounded-full bg-card px-1.5 tabular-nums text-muted-foreground">{list.length}</span>
              </p>
              <div className="space-y-2">
                {list.map((t) => (
                  <motion.div key={t.id} layoutId={`demo-task-${t.id}`} transition={{ type: "spring", stiffness: 260, damping: 26 }} className="rounded-xl border bg-card p-2 shadow-soft sm:p-2.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold", t.priority === "High" ? "bg-destructive/12 text-destructive" : t.priority === "Medium" ? "bg-warning/14 text-warning" : "bg-muted text-muted-foreground")}>
                      <Flag weight="fill" className="size-2.5" />{t.priority}
                    </span>
                    <p className={cn("mt-1.5 text-[0.6875rem] font-bold leading-snug sm:text-xs", col.id === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Avatar name={t.who} size="xs" className="size-5 text-[0.5rem]" />
                      <span className="hidden truncate text-[0.625rem] text-muted-foreground sm:block">{t.who}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────

const chatLines = [
  { who: "Nazmul Hasan", text: "Schema is done. I can start on the API next.", me: false },
  { who: "You", text: "Nice! I'll finish the event list page by Friday.", me: true },
  { who: "Chinmoy Kumar", text: "Then I'll write the tests once that lands.", me: false },
];

function ChatDemo() {
  const step = useSteps(5, 1100); // 1-3 messages, 4 typing, 5 suggestion
  const [added, setAdded] = React.useState(false);
  return (
    <div className="flex h-full flex-col justify-end gap-2.5">
      {chatLines.slice(0, Math.min(step, 3)).map((m) => (
        <motion.div key={m.text} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }} className={cn("flex items-end gap-2", m.me && "flex-row-reverse")}>
          {!m.me && <Avatar name={m.who} size="xs" />}
          <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed sm:text-[0.8125rem]", m.me ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
            {!m.me && <p className="mb-0.5 text-[0.625rem] font-bold text-muted-foreground">{m.who}</p>}
            {m.text}
          </div>
        </motion.div>
      ))}
      <AnimatePresence mode="wait">
        {step === 4 && (
          <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[0.6875rem] font-semibold text-warm-text">
            <Sparkle weight="fill" className="size-3.5" /> AI is reading the chat
            <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="size-1 animate-typing rounded-full bg-warm" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
          </motion.div>
        )}
        {step >= 5 && (
          <motion.div key="suggestion" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-warm/50 bg-warm/10 p-2.5 sm:p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warm text-warm-foreground"><Sparkle weight="fill" className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.625rem] font-bold uppercase tracking-wider text-warm-text">Suggested task</p>
              <p className="truncate text-xs font-bold sm:text-sm">Finish the event list page · due Friday</p>
            </div>
            <button type="button" onClick={() => setAdded(true)} disabled={added}
              className={cn("tap inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition-[background-color,transform] active:scale-95", added ? "bg-success/15 text-success" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {added ? <><Check weight="bold" className="size-3.5" /> Added</> : "Add to board"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Insights ────────────────────────────────────────────────────────────

const insightTeams = [
  { name: "Team Nova", progress: 68, health: "Healthy", ok: true },
  { name: "Team Orbit", progress: 34, health: "Needs attention", ok: false },
  { name: "Team Atlas", progress: 81, health: "Healthy", ok: true },
  { name: "Team Pixel", progress: 52, health: "Healthy", ok: true },
];

function InsightsDemo() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col justify-center gap-3.5">
      {insightTeams.map((t, i) => (
        <div key={t.name} className="group grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
          <p className="truncate text-xs font-bold sm:text-sm">{t.name}</p>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-chart-1 transition-[filter] group-hover:brightness-110" initial={{ width: reduce ? `${t.progress}%` : 0 }} animate={{ width: `${t.progress}%` }} transition={{ duration: 1, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold sm:text-[0.6875rem]", t.ok ? "bg-success/12 text-success" : "bg-warning/14 text-warning")}>
            {t.ok ? <CheckCircle weight="fill" className="size-3" /> : <WarningCircle weight="fill" className="size-3" />}
            <span className="hidden sm:inline">{t.health}</span>
            <span className="tabular-nums sm:hidden">{t.progress}%</span>
          </span>
        </div>
      ))}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 1.2 }} className="mt-1 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-xs">
        <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p><strong className="font-bold">Team Orbit</strong> <span className="text-muted-foreground">has gone quiet and one member is waiting on requirements. Worth a check-in.</span></p>
      </motion.div>
    </div>
  );
}

// ─── Window ──────────────────────────────────────────────────────────────

export function ProductDemo() {
  const reduce = useReducedMotion();
  const [tab, setTab] = React.useState<TabId>("board");
  const [paused, setPaused] = React.useState(false);
  const [run, setRun] = React.useState(0); // bumps to restart the progress bar and the panel animation
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  // Auto-advance through the tabs until the visitor takes over (hover, focus or a click).
  React.useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => {
      setTab((cur) => tabs[(tabs.findIndex((x) => x.id === cur) + 1) % tabs.length].id);
      setRun((r) => r + 1);
    }, TAB_MS);
    return () => clearTimeout(t);
  }, [tab, run, paused, reduce]);

  // Subtle tilt toward the pointer (mouse only).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [3.5, -3.5]), { stiffness: 140, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-4.5, 4.5]), { stiffness: 140, damping: 18 });

  const select = (id: TabId, focus = false) => {
    setTab(id);
    setRun((r) => r + 1);
    if (focus) tabRefs.current[id]?.focus();
  };
  const current = tabs.find((t) => t.id === tab)!;

  return (
    <div
      className="[perspective:1600px]"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => { setPaused(false); mx.set(0); my.set(0); }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <motion.div style={{ rotateX, rotateY }} className="relative overflow-hidden rounded-[1.75rem] border bg-card shadow-lift [transform-style:preserve-3d]">
        {/* window bar */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-destructive/60" /><span className="size-2.5 rounded-full bg-warning/70" /><span className="size-2.5 rounded-full bg-success/60" />
          </div>
          <div role="tablist" aria-label="Product tour" className="mx-auto flex items-center gap-1 rounded-xl bg-background/80 p-1">
            {tabs.map((t, i) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => { tabRefs.current[t.id] = el; }}
                  role="tab"
                  type="button"
                  id={`demo-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls="demo-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length].id, true);
                    if (e.key === "ArrowLeft") select(tabs[(i + tabs.length - 1) % tabs.length].id, true);
                  }}
                  className={cn("tap relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-3 text-xs font-bold transition-colors sm:text-[0.8125rem]", active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {active && <motion.span layoutId="demo-tab-pill" className="absolute inset-0 rounded-lg bg-primary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  {active && !paused && !reduce && (
                    <motion.span key={run} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary-foreground/60" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: TAB_MS / 1000, ease: "linear" }} />
                  )}
                  <t.icon weight={active ? "fill" : "regular"} className="relative size-4" aria-hidden />
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden w-12 sm:block" aria-hidden />
        </div>

        <div id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${tab}`} className="relative h-[21rem] p-3 sm:h-[23rem] sm:p-5">
          <p className="sr-only">Example: {current.caption}</p>
          <AnimatePresence mode="wait">
            <motion.div key={`${tab}-${run}`} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {tab === "board" && <BoardDemo />}
              {tab === "chat" && <ChatDemo />}
              {tab === "insights" && <InsightsDemo />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      <p className="mt-4 text-center text-sm font-medium text-muted-foreground" aria-hidden>{current.caption}</p>
    </div>
  );
}
