"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowsClockwise, ArrowRight, CheckCircle, Confetti, IdentificationCard, Minus, Plus, Sparkle, ThumbsUp, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { applyTeamMatching, runTeamMatching } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import type { MatchProposal } from "@/lib/types";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AnimatedNumber, EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import { ProgressRing } from "@/components/ui/progress";

const steps = [
  { icon: IdentificationCard, title: "Students fill in profiles", body: "Skills and availability come from each student's profile." },
  { icon: Sparkle, title: "AI proposes teams", body: "It mixes complementary skills and overlapping free time." },
  { icon: ThumbsUp, title: "You approve", body: "Rename teams, regenerate, or create them. Nothing is saved until you do." },
];
const thinking = ["Reading skills and availability…", "Pairing complementary strengths…", "Checking schedules overlap…", "Scoring each team…"];

type Result = { courseId: string; courseTitle: string; proposals: (MatchProposal & { key: string })[] };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "no-course" } | { kind: "ready"; result: Result } | { kind: "created"; count: number };

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
        <p className="mt-4 text-xs text-muted-foreground">This usually takes 5 to 20 seconds.</p>
      </div>
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

  return (
    <Page>
      <PageHeader title="AI team matching" description="Group the students who aren't on a team yet into balanced teams, in seconds." />

      {/* Controls */}
      <Card className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 animate-drift rounded-full bg-warm/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-brand/25 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <ol className="grid gap-5 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 sm:flex-col">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand"><s.icon weight="duotone" className="size-5" aria-hidden /></span>
                <div>
                  <p className="text-sm font-bold"><span className="text-sidebar-muted">{i + 1}.</span> {s.title}</p>
                  <p className="mt-0.5 text-sm text-sidebar-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
            <div>
              <p id="size-label" className="text-sm font-bold">Students per team</p>
              <div className="mt-2 flex items-center gap-2" role="group" aria-labelledby="size-label">
                <Button variant="ghost" size="icon" className="bg-white/10 text-white hover:bg-white/20 hover:text-white" aria-label="Fewer students per team" disabled={size <= 2 || busy} onClick={() => setSize((n) => n - 1)}><Minus weight="bold" /></Button>
                <output aria-live="polite" className="w-12 text-center text-3xl font-extrabold tabular-nums">{size}</output>
                <Button variant="ghost" size="icon" className="bg-white/10 text-white hover:bg-white/20 hover:text-white" aria-label="More students per team" disabled={size >= 8 || busy} onClick={() => setSize((n) => n + 1)}><Plus weight="bold" /></Button>
              </div>
            </div>
            <Button variant="warm" size="lg" loading={busy} onClick={generate}>
              {!busy && <Sparkle weight="fill" aria-hidden />}
              {state.kind === "ready" ? "Regenerate" : "Generate teams"}
            </Button>
          </div>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div key={state.kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="space-y-5">
          {state.kind === "idle" && (
            <Card className="border-dashed bg-transparent shadow-none">
              <EmptyState icon={Sparkle} title="No proposals yet" description="Pick how many students each team should have, then generate. You'll see every proposed team, its fit score and why it works before anything is created." />
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
            <Card>
              <div className="flex flex-col items-center px-6 py-14 text-center" role="status">
                <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 240, damping: 14 }} className="flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
                  <Confetti weight="duotone" className="size-9" aria-hidden />
                </motion.span>
                <h2 className="mt-4 text-xl font-extrabold">{state.count} {state.count === 1 ? "team" : "teams"} created</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Students now see their team, chat and board the next time they open CampusNova.</p>
                <Button asChild className="mt-5"><Link href="/instructor">View teams <ArrowRight aria-hidden /></Link></Button>
              </div>
            </Card>
          )}

          {state.kind === "ready" && (state.result.proposals.length === 0 ? (
            <Card><EmptyState icon={CheckCircle} title="Everyone already has a team" description={`No unplaced students in ${state.result.courseTitle}. When new students enrol, come back to match them.`}><Button asChild variant="outline"><Link href="/instructor">View teams</Link></Button></EmptyState></Card>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold outline-none">{state.result.proposals.length} proposed {state.result.proposals.length === 1 ? "team" : "teams"}</h2>
                  <p className="text-sm text-muted-foreground">{state.result.courseTitle} · rename any team before creating.</p>
                </div>
                <Button size="lg" onClick={() => setConfirm(true)} loading={creating}><CheckCircle weight="fill" aria-hidden /> Create {state.result.proposals.length === 1 ? "team" : "teams"}</Button>
              </div>
              <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {state.result.proposals.map((p, i) => (
                  <StaggerItem key={p.key}>
                    <Card interactive className="flex h-full flex-col p-5">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`team-name-${i}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Team name</label>
                          <Input id={`team-name-${i}`} value={p.name} maxLength={100} onChange={(e) => rename(p.key, e.target.value)} className="mt-1 font-bold" aria-invalid={!p.name.trim()} />
                        </div>
                        <ProgressRing value={p.score} size={64} stroke={6} label={`Fit score for ${p.name}`} color="var(--warm)">
                          <span className="text-base font-extrabold"><AnimatedNumber value={p.score} /></span>
                        </ProgressRing>
                      </div>
                      <ul className="mt-4 space-y-2">
                        {p.members.map((m) => (
                          <li key={m.id} className="flex items-center gap-2.5"><Avatar name={m.name} size="sm" /><span className="truncate text-sm font-semibold">{m.name}</span></li>
                        ))}
                      </ul>
                      {p.strengths.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Why this works</p>
                          <div className="flex flex-wrap gap-1.5">{p.strengths.map((s) => <Badge key={s} variant="warm" className="whitespace-normal text-left">{s}</Badge>)}</div>
                        </div>
                      )}
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            </>
          ))}
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Create these teams?" confirmLabel="Create teams" destructive={false}
        description="Students are placed straight away and get access to their team's chat, board and files. Teams can't be undone from here."
        onConfirm={create} />
    </Page>
  );
}
