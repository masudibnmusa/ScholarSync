"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowsClockwise, ArrowRight, Check, CheckCircle, Clock, Confetti, IdentificationCard, Minus, Plus, Sparkle, ThumbsUp, UsersThree, WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { applyTeamMatching, runTeamMatching } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MatchProposal } from "@/lib/types";
import { EmptyState, Page } from "@/components/app/page";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedNumber, EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import { ProgressRing } from "@/components/ui/progress";

const steps = [
  { icon: IdentificationCard, title: "Profiles", body: "Skills and availability from each student." },
  { icon: Sparkle, title: "AI proposes", body: "Complementary skills, overlapping free time." },
  { icon: ThumbsUp, title: "You approve", body: "Rename, regenerate or create. Nothing saves until you do." },
];
const thinking = ["Reading skills and availability…", "Pairing complementary strengths…", "Checking schedules overlap…", "Scoring each team…"];
const PRESETS = [2, 3, 4, 5];

type Result = { courseId: string; courseTitle: string; proposals: (MatchProposal & { key: string })[] };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "no-course" } | { kind: "ready"; result: Result } | { kind: "created"; count: number };

/** Fit score in words, so the ring's colour is never the only signal. */
function fitOf(score: number) {
  if (score >= 80) return { label: "Great fit", color: "var(--success)", text: "text-success" };
  if (score >= 60) return { label: "Good fit", color: "var(--warm)", text: "text-warm-text" };
  return { label: "Fair fit", color: "var(--warning)", text: "text-warning" };
}

/** Which step of the flow is current: 1 (set up), 2 (AI working / proposals ready), 3 (created). */
function stepFor(kind: State["kind"]) {
  return kind === "created" ? 3 : kind === "loading" || kind === "ready" ? 2 : 1;
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-3 sm:gap-0">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current || current === 3;
        const active = n === current && current !== 3;
        return (
          <li key={s.title} className="relative flex gap-3 sm:flex-col sm:pr-6" aria-current={active ? "step" : undefined}>
            {/* connector between steps (desktop) */}
            {i < steps.length - 1 && (
              <span className="absolute left-12 right-0 top-5 hidden h-0.5 overflow-hidden rounded-full bg-white/10 sm:block" aria-hidden>
                <motion.span className="block h-full bg-brand" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.6, ease: EASE }} />
              </span>
            )}
            <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
              done ? "bg-brand text-sidebar" : active ? "bg-warm text-warm-foreground shadow-lift" : "bg-white/10 text-brand")}>
              {done ? <Check weight="bold" className="size-5" aria-hidden /> : <s.icon weight="duotone" className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white"><span className="text-sidebar-muted">Step {n} · </span>{s.title}{done && <span className="sr-only"> (done)</span>}</p>
              <p className="mt-0.5 text-sm text-sidebar-muted">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Thinking() {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % thinking.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="relative overflow-hidden" role="status" aria-live="polite">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <div className="relative flex flex-col items-center px-6 py-16 text-center">
        <div className="relative flex size-24 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-warm/40" aria-hidden />
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/40 [animation-delay:0.6s]" aria-hidden />
          <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: "linear" }} className="absolute inset-1 rounded-full border-2 border-dashed border-primary/40" aria-hidden />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-warm text-warm-foreground shadow-lift"><Sparkle weight="fill" className="size-7" aria-hidden /></span>
        </div>
        <h2 className="mt-6 text-xl font-extrabold">Building balanced teams</h2>
        <AnimatePresence mode="wait">
          <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="mt-1 text-sm text-muted-foreground">{thinking[i]}</motion.p>
        </AnimatePresence>
        {/* indeterminate shimmer bar */}
        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-muted" aria-hidden>
          <motion.span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-warm" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">This usually takes a few seconds.</p>
      </div>
    </Card>
  );
}

function ProposalCard({ p, index, onRename }: { p: Result["proposals"][number]; index: number; onRename: (name: string) => void }) {
  const fit = fitOf(p.score);
  const invalid = !p.name.trim();
  return (
    <Card interactive className="flex h-full flex-col overflow-hidden">
      {/* Header band: number, editable name, fit ring */}
      <div className="relative flex items-start gap-3 bg-gradient-to-br from-secondary via-secondary/60 to-transparent p-5 pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar text-sm font-extrabold text-brand shadow-soft" aria-hidden>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <label htmlFor={`team-name-${index}`} className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground">Team name</label>
          <input id={`team-name-${index}`} value={p.name} maxLength={100} onChange={(e) => onRename(e.target.value)} aria-invalid={invalid}
            className={cn("-mx-1.5 mt-0.5 block w-[calc(100%+0.75rem)] rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-lg font-extrabold outline-none transition-colors hover:border-input focus:border-ring focus:bg-card focus:ring-[3px] focus:ring-ring/25",
              invalid && "border-destructive bg-card")} />
          {invalid && <p className="mt-1 text-xs font-semibold text-destructive">Give this team a name.</p>}
        </div>
        <div className="flex flex-col items-center">
          <ProgressRing value={p.score} size={58} stroke={6} label={`Fit score for ${p.name || `team ${index + 1}`}`} color={fit.color}>
            <span className="text-sm font-extrabold tabular-nums"><AnimatedNumber value={p.score} /></span>
          </ProgressRing>
          <span className={cn("mt-1 text-[0.6875rem] font-bold", fit.text)}>{fit.label}</span>
        </div>
      </div>

      {/* Members with the skills they bring */}
      <ul className="space-y-3 px-5 pt-1">
        {p.members.map((m) => (
          <li key={m.id} className="flex items-start gap-2.5">
            <Avatar name={m.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {m.skills.slice(0, 3).map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{s}</span>)}
                {m.availability && <span className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground"><Clock className="size-3" aria-hidden />{m.availability}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {p.strengths.length > 0 && (
        <div className="mx-5 mb-5 mt-4 rounded-xl bg-warm/[0.07] p-3.5 ring-1 ring-warm/20">
          <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-warm-text"><Sparkle weight="fill" className="size-3.5" aria-hidden />Why this works</p>
          <ul className="space-y-1.5">
            {p.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-sm leading-snug"><CheckCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{s}</li>
            ))}
          </ul>
        </div>
      )}
      {p.strengths.length === 0 && <div className="pb-5" />}
    </Card>
  );
}

export function MatchingPanel() {
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const [size, setSize] = React.useState(3);
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const [confirm, setConfirm] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  async function generate() {
    setState({ kind: "loading" });
    try {
      const res = await runTeamMatching(size);
      if (!res) return setState({ kind: "no-course" });
      setState({ kind: "ready", result: { ...res, proposals: res.proposals.map((p, i) => ({ ...p, key: `${i}-${p.name}` })) } });
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (err) {
      console.error("Team matching failed:", err);
      setState({ kind: "error", message: "The AI service didn't answer. Check that GEMINI_API_KEY is set, then try again." });
    }
  }

  async function create() {
    if (state.kind !== "ready") return;
    const { result } = state;
    const names = result.proposals.map((p) => p.name.trim());
    if (names.some((n) => !n)) return void toast.error("Every team needs a name");
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return void toast.error("Team names must be different");
    setCreating(true);
    try {
      await applyTeamMatching(result.courseId, result.proposals.map((p) => ({ name: p.name.trim(), memberIds: p.members.map((m) => m.id) })));
      await fetchTeams();
      setState({ kind: "created", count: result.proposals.length });
    } catch (err) {
      console.error("Creating teams failed:", err);
      const dup = err instanceof Error && /duplicate|unique/i.test(err.message);
      toast.error("Could not create the teams", { description: dup ? "A team with one of these names already exists in the course. Rename it and try again." : "Nothing was saved. Please try again." });
    }
    setCreating(false);
  }

  const rename = (key: string, name: string) => setState((s) => s.kind === "ready" ? { kind: "ready", result: { ...s.result, proposals: s.result.proposals.map((p) => (p.key === key ? { ...p, name } : p)) } } : s);
  const busy = state.kind === "loading";
  const ready = state.kind === "ready" && state.result.proposals.length > 0 ? state.result : null;
  const placed = ready ? ready.proposals.reduce((n, p) => n + p.members.length, 0) : 0;
  const avgFit = ready ? Math.round(ready.proposals.reduce((n, p) => n + p.score, 0) / ready.proposals.length) : 0;

  return (
    <Page className="space-y-8">
      {/* ── Hero: the flow and the controls ───────────────────────────────────────── */}
      <motion.section
        aria-labelledby="matching-title"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-3xl bg-sidebar p-6 text-sidebar-foreground shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute -right-24 -top-28 size-96 animate-drift rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--warm)_30%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-16 size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_30%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.07]" aria-hidden />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div className="min-w-0 space-y-7">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">
                <Sparkle weight="fill" className="size-3.5" aria-hidden /> Powered by AI · you stay in control
              </p>
              <h1 id="matching-title" className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">AI team matching</h1>
              <p className="mt-2 max-w-xl text-sm text-sidebar-muted sm:text-[0.9375rem]">Group the students who aren&apos;t on a team yet into balanced teams, in seconds.</p>
            </div>
            <Stepper current={stepFor(state.kind)} />
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm">
            <p id="size-label" className="text-sm font-bold text-white">Students per team</p>
            <div className="mt-3 flex items-center justify-between gap-2" role="group" aria-labelledby="size-label">
              <Button variant="ghost" size="icon" className="size-11 rounded-xl bg-white/10 text-white hover:bg-white/20 hover:text-white" aria-label="Fewer students per team" disabled={size <= 2 || busy} onClick={() => setSize((n) => n - 1)}><Minus weight="bold" /></Button>
              <output aria-live="polite" className="flex flex-col items-center">
                <span className="text-4xl font-extrabold tabular-nums text-white">{size}</span>
                <span className="text-[0.6875rem] font-semibold text-sidebar-muted">per team</span>
              </output>
              <Button variant="ghost" size="icon" className="size-11 rounded-xl bg-white/10 text-white hover:bg-white/20 hover:text-white" aria-label="More students per team" disabled={size >= 8 || busy} onClick={() => setSize((n) => n + 1)}><Plus weight="bold" /></Button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Quick sizes">
              {PRESETS.map((n) => (
                <button key={n} type="button" disabled={busy} onClick={() => setSize(n)} aria-pressed={size === n}
                  className={cn("h-9 rounded-lg text-sm font-bold transition-colors disabled:opacity-50", size === n ? "bg-brand text-sidebar" : "bg-white/[0.06] text-sidebar-muted hover:bg-white/15 hover:text-white")}>
                  {n}
                </button>
              ))}
            </div>
            <Button variant="warm" size="lg" className="mt-4 w-full" loading={busy} onClick={generate}>
              {!busy && <Sparkle weight="fill" aria-hidden />}
              {state.kind === "ready" ? "Regenerate" : "Generate teams"}
            </Button>
            <p className="mt-2.5 text-center text-[0.6875rem] text-sidebar-muted">Uneven numbers get a few larger teams, never one of a single student.</p>
          </div>
        </div>
      </motion.section>

      {/* ── Results ───────────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div key={state.kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="space-y-5">
          {state.kind === "idle" && (
            <Card className="border-dashed bg-transparent shadow-none">
              <EmptyState icon={UsersThree} title="No proposals yet" description="Pick how many students each team should have, then generate. You'll see every proposed team, its fit score and why it works before anything is created." />
            </Card>
          )}

          {state.kind === "loading" && <Thinking />}

          {state.kind === "error" && (
            <Card><EmptyState icon={WarningCircle} title="Matching didn't finish" description={state.message}><Button onClick={generate}><ArrowsClockwise aria-hidden /> Try again</Button></EmptyState></Card>
          )}

          {state.kind === "no-course" && (
            <Card><EmptyState icon={UsersThree} title="You don't have a course yet" description="Matching works on the students enrolled in your course. Ask your administrator to set up the course and enrolments." /></Card>
          )}

          {state.kind === "created" && (
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--success)_12%,transparent),transparent_60%)]" aria-hidden />
              <div className="relative flex flex-col items-center px-6 py-14 text-center" role="status">
                <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 240, damping: 14 }} className="flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
                  <Confetti weight="duotone" className="size-9" aria-hidden />
                </motion.span>
                <h2 className="mt-4 text-xl font-extrabold">{state.count} {state.count === 1 ? "team" : "teams"} created</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Students now see their team, chat and tasks the next time they open ScholarSync.</p>
                <Button asChild className="mt-5"><Link href="/instructor">View teams <ArrowRight aria-hidden /></Link></Button>
              </div>
            </Card>
          )}

          {state.kind === "ready" && !ready && (
            <Card><EmptyState icon={CheckCircle} title="Everyone already has a team" description={`No unplaced students in ${state.result.courseTitle}. When new students enrol, come back to match them.`}><Button asChild variant="outline"><Link href="/instructor">View teams</Link></Button></EmptyState></Card>
          )}

          {ready && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold outline-none">{ready.proposals.length} proposed {ready.proposals.length === 1 ? "team" : "teams"}</h2>
                  <p className="text-sm text-muted-foreground">{ready.courseTitle} · rename any team before creating.</p>
                </div>
                <dl className="flex divide-x rounded-2xl border bg-card shadow-soft">
                  {([["Teams", ready.proposals.length], ["Students", placed], ["Avg fit", avgFit]] as const).map(([k, v]) => (
                    <div key={k} className="px-4 py-2 text-center">
                      <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{k}</dt>
                      <dd className="text-lg font-extrabold tabular-nums"><AnimatedNumber value={v} /></dd>
                    </div>
                  ))}
                </dl>
              </div>

              <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ready.proposals.map((p, i) => (
                  <StaggerItem key={p.key} className="h-full"><ProposalCard p={p} index={i} onRename={(name) => rename(p.key, name)} /></StaggerItem>
                ))}
              </Stagger>

              {/* Sticky action bar: the decision stays in reach on long lists */}
              <div className="sticky bottom-4 z-30">
                <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border bg-card/95 p-2.5 shadow-lift backdrop-blur sm:gap-3 sm:p-3 sm:pl-4">
                  <span className="hidden sm:block"><AvatarStack names={ready.proposals.flatMap((p) => p.members.map((m) => m.name))} max={5} /></span>
                  <p className="hidden min-w-0 flex-1 text-sm sm:block"><span className="font-bold">{placed} students</span> <span className="text-muted-foreground">into {ready.proposals.length} {ready.proposals.length === 1 ? "team" : "teams"}</span></p>
                  <Button variant="outline" className="flex-1 sm:flex-none" onClick={generate}><ArrowsClockwise aria-hidden /> Regenerate</Button>
                  <Button className="flex-1 sm:flex-none" onClick={() => setConfirm(true)} loading={creating}>{!creating && <CheckCircle weight="fill" aria-hidden />} Create {ready.proposals.length === 1 ? "team" : "teams"}</Button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Create these teams?" confirmLabel="Create teams" destructive={false}
        description="Students are placed straight away and get access to their team's chat, tasks and files. Teams can't be undone from here."
        onConfirm={create} />
    </Page>
  );
}
