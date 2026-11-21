"use client";

import * as React from "react";
import { DownloadSimple, Eye, EyeSlash, Exam, PencilSimple, Plus, Star, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { exportGradebook, getCourseGrading, getMyGrade, saveRubric, saveTeamGrade, setGradesReleased } from "@/app/actions";
import { finalPercent, FACTOR_MAX, FACTOR_MIN, teamPercent } from "@/lib/grading";
import { cn, downloadCsv } from "@/lib/utils";
import type { CourseGrading, MyGrade, RubricCriterion } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";

type GradedTeam = CourseGrading["teams"][number];
const pct = (n: number | null) => (n == null ? "—" : `${n}%`);
const pointsOf = (t: GradedTeam) => Object.fromEntries(Object.entries(t.scores).map(([k, v]) => [k, v.points]));

function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sky text-info"><Exam weight="fill" className="size-[1.125rem]" aria-hidden /></span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

// ─── Rubric editor ───────────────────────────────────────────────────────

function RubricDialog({ courseId, criteria, open, onOpenChange, onSaved }: {
  courseId: string; criteria: RubricCriterion[]; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [rows, setRows] = React.useState(() => criteria.length
    ? criteria.map((c) => ({ key: c.id, id: c.id as string | undefined, name: c.name, maxPoints: String(c.maxPoints) }))
    : [{ key: "new-0", id: undefined, name: "", maxPoints: "10" }]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const total = rows.reduce((n, r) => n + (Number(r.maxPoints) || 0), 0);
  const set = (key: string, patch: Partial<(typeof rows)[number]>) => { setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r))); setError(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = rows.map((r) => ({ id: r.id, name: r.name.trim(), maxPoints: Number(r.maxPoints) }));
    if (clean.some((r) => !r.name)) return setError("Every criterion needs a name.");
    if (clean.some((r) => !Number.isInteger(r.maxPoints) || r.maxPoints < 1 || r.maxPoints > 1000)) return setError("Points must be whole numbers from 1 to 1000.");
    setSaving(true);
    try {
      await saveRubric(courseId, clean);
      toast.success("Rubric saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Saving rubric failed:", err);
      toast.error("Could not save the rubric");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Rubric</DialogTitle>
          <DialogDescription>What you mark every team on. Removing a criterion also removes the marks given for it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] gap-2 px-1 text-xs font-semibold text-muted-foreground">
            <span>Criterion</span><span>Max points</span><span className="sr-only">Remove</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2">
              <Input aria-label={`Criterion ${i + 1} name`} value={r.name} maxLength={80} placeholder="e.g. Code quality" onChange={(e) => set(r.key, { name: e.target.value })} />
              <Input aria-label={`Criterion ${i + 1} max points`} type="number" inputMode="numeric" min={1} max={1000} value={r.maxPoints} onChange={(e) => set(r.key, { maxPoints: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash className="size-4" /></Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" disabled={rows.length >= 20}
              onClick={() => setRows([...rows, { key: `new-${Date.now()}`, id: undefined, name: "", maxPoints: "10" }])}>
              <Plus aria-hidden /> Add criterion
            </Button>
            <span className="text-sm font-semibold">Total: {total} points</span>
          </div>
          {error && <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save rubric</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grading one team ────────────────────────────────────────────────────

function TeamGradeDialog({ team, criteria, open, onOpenChange, onSaved }: {
  team: GradedTeam; criteria: RubricCriterion[]; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [scores, setScores] = React.useState(() => Object.fromEntries(criteria.map((c) => [c.id, {
    points: team.scores[c.id] ? String(team.scores[c.id].points) : "", feedback: team.scores[c.id]?.feedback ?? "",
  }])));
  const [overrides, setOverrides] = React.useState(() => Object.fromEntries(team.members.map((m) => [m.userId, m.override == null ? "" : String(m.override)])));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const points = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.points === "" ? undefined : Number(v.points)]));
  const team100 = teamPercent(criteria, points);
  const factorOf = (userId: string, suggested: number) => (overrides[userId] === "" ? suggested : Number(overrides[userId]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    for (const c of criteria) {
      const p = points[c.id];
      if (p == null) return setError(`Give "${c.name}" a mark.`);
      if (!(p >= 0 && p <= c.maxPoints)) return setError(`"${c.name}" must be between 0 and ${c.maxPoints}.`);
    }
    for (const m of team.members) {
      const o = overrides[m.userId];
      if (o !== "" && !(Number(o) >= 0.5 && Number(o) <= 1.5)) return setError(`${m.name}'s factor must be between 0.5 and 1.5, or empty.`);
    }
    setSaving(true);
    try {
      await saveTeamGrade(team.teamId, {
        scores: criteria.map((c) => ({ criterionId: c.id, points: points[c.id]!, feedback: scores[c.id].feedback })),
        overrides: team.members.map((m) => ({ userId: m.userId, factor: overrides[m.userId] === "" ? null : Number(overrides[m.userId]) })),
      });
      toast.success(`${team.teamName} graded`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Saving grade failed:", err);
      toast.error("Could not save the grade");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grade {team.teamName}</DialogTitle>
          <DialogDescription>Mark the team on each criterion. Each student&apos;s grade is the team grade times their contribution factor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-5">
          <ol className="space-y-3">
            {criteria.map((c) => (
              <li key={c.id} className="rounded-2xl bg-muted/60 p-3">
                <div className="flex items-center gap-3">
                  <label htmlFor={`pts-${c.id}`} className="min-w-0 flex-1 font-semibold">{c.name}</label>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Input id={`pts-${c.id}`} type="number" inputMode="decimal" step={0.5} min={0} max={c.maxPoints} className="h-9 w-20 text-right"
                      value={scores[c.id].points} onChange={(e) => { setScores({ ...scores, [c.id]: { ...scores[c.id], points: e.target.value } }); setError(null); }} />
                    / {c.maxPoints}
                  </span>
                </div>
                <Textarea aria-label={`Feedback on ${c.name}`} rows={1} maxLength={2000} placeholder="Feedback for the team (optional)" className="mt-2 min-h-9 bg-card"
                  value={scores[c.id].feedback} onChange={(e) => setScores({ ...scores, [c.id]: { ...scores[c.id], feedback: e.target.value } })} />
              </li>
            ))}
          </ol>
          <p className="flex items-center justify-between rounded-2xl bg-sky px-4 py-3 font-semibold">
            Team grade <span className="font-display text-2xl">{pct(team100)}</span>
          </p>

          <div>
            <h3 className="text-sm font-bold">Individual grades</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Factor suggested from peer reviews (their average vs the team&apos;s, within {FACTOR_MIN}–{FACTOR_MAX}). Type a factor to override it.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-1.5 font-semibold">Student</th><th className="font-semibold">Peer avg</th><th className="font-semibold">Suggested</th><th className="font-semibold">Override</th><th className="text-right font-semibold">Grade</th></tr>
                </thead>
                <tbody className="divide-y">
                  {team.members.map((m) => {
                    const f = factorOf(m.userId, m.suggestedFactor);
                    return (
                      <tr key={m.userId}>
                        <td className="py-2 pr-2 font-semibold">{m.name}</td>
                        <td className="pr-2 text-muted-foreground">{m.peerAvg == null ? "No reviews" : <span className="inline-flex items-center gap-1"><Star weight="fill" className="size-3.5 text-butter-strong" aria-hidden />{m.peerAvg} <span className="text-xs">({m.reviews})</span></span>}</td>
                        <td className="pr-2 tabular-nums">×{m.suggestedFactor.toFixed(2)}</td>
                        <td className="pr-2">
                          <Input aria-label={`Override factor for ${m.name}`} type="number" inputMode="decimal" step={0.05} min={0.5} max={1.5} placeholder="—" className="h-8 w-20"
                            value={overrides[m.userId]} onChange={(e) => { setOverrides({ ...overrides, [m.userId]: e.target.value }); setError(null); }} />
                        </td>
                        <td className="text-right font-bold tabular-nums">{pct(Number.isFinite(f) ? finalPercent(team100, f) : null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {error && <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save grade</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Instructor panel ────────────────────────────────────────────────────

export function GradingPanel({ courseId }: { courseId: string }) {
  const [data, setData] = React.useState<CourseGrading | null>(null);
  const [rubricOpen, setRubricOpen] = React.useState(false);
  const [grading, setGrading] = React.useState<GradedTeam | null>(null);
  const [confirmRelease, setConfirmRelease] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const { filename, csv } = await exportGradebook(courseId);
      downloadCsv(filename, csv);
    } catch (err) {
      console.error("Gradebook export failed:", err);
      toast.error("Could not export the gradebook");
    }
    setExporting(false);
  }

  const load = React.useCallback(() => getCourseGrading(courseId).then(setData).catch((err) => console.error("Loading grading failed:", err)), [courseId]);
  const live = useLive("courses", "rubric_criteria", "team_grades", "student_grade_factors", "teams", "team_members", "peer_reviews");
  React.useEffect(() => { load(); }, [load, live]);

  async function release(next: boolean) {
    setBusy(true);
    try {
      await setGradesReleased(courseId, next);
      toast.success(next ? "Grades released. Students were notified." : "Grades hidden from students");
      await load();
    } catch (err) {
      console.error("Changing release failed:", err);
      toast.error("Could not change grade visibility");
    }
    setBusy(false);
  }

  if (!data) return <Card className="p-5 sm:p-6"><Skeleton className="h-24" /></Card>;
  const total = data.criteria.reduce((n, c) => n + c.maxPoints, 0);
  const graded = data.teams.filter((t) => teamPercent(data.criteria, pointsOf(t)) != null).length;

  return (
    <Card className="p-5 sm:p-6">
      <CardTitle aside={
        <div className="flex flex-wrap items-center gap-2">
          {data.released ? <Badge variant="success"><Eye aria-hidden /> Visible to students</Badge> : <Badge variant="muted"><EyeSlash aria-hidden /> Draft</Badge>}
          {graded > 0 && <Button size="sm" variant="outline" loading={exporting} onClick={exportCsv}>{!exporting && <DownloadSimple aria-hidden />} Export gradebook</Button>}
          <Button size="sm" variant="outline" onClick={() => setRubricOpen(true)}><PencilSimple aria-hidden /> {data.criteria.length ? "Edit rubric" : "Set up rubric"}</Button>
          {data.criteria.length > 0 && (data.released
            ? <Button size="sm" variant="outline" loading={busy} onClick={() => release(false)}>Hide grades</Button>
            : <Button size="sm" loading={busy} disabled={!graded} onClick={() => setConfirmRelease(true)}>Release grades</Button>)}
        </div>
      }>
        Grading
      </CardTitle>

      {!data.criteria.length ? (
        <button type="button" onClick={() => setRubricOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
          <Exam aria-hidden className="size-4" /> Set up a rubric, then mark each team against it
        </button>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {data.criteria.map((c) => `${c.name} (${c.maxPoints})`).join(" · ")} · <span className="font-semibold text-foreground">{total} points</span>
          </p>
          {data.teams.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No teams to grade yet.</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.teams.map((t) => {
                const p = teamPercent(data.criteria, pointsOf(t));
                const started = Object.keys(t.scores).length > 0;
                return (
                  <li key={t.teamId} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", p != null ? "bg-sky" : "bg-muted/60")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.teamName}</p>
                      <p className="text-xs text-muted-foreground">{p != null ? `Team grade ${p}%` : started ? "Partly marked" : "Not graded"}</p>
                    </div>
                    <Button size="sm" variant={p != null ? "outline" : "default"} onClick={() => setGrading(t)}>{p != null ? "Edit" : "Grade"}</Button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{graded} of {data.teams.length} teams graded. The gradebook CSV (one row per student, keyed by email) imports into Moodle or Canvas.</p>
        </>
      )}

      {rubricOpen && <RubricDialog courseId={courseId} criteria={data.criteria} open onOpenChange={setRubricOpen} onSaved={load} />}
      {grading && <TeamGradeDialog key={grading.teamId} team={grading} criteria={data.criteria} open onOpenChange={(o) => { if (!o) setGrading(null); }} onSaved={load} />}
      <ConfirmDialog open={confirmRelease} onOpenChange={setConfirmRelease} destructive={false} confirmLabel="Release grades"
        title="Release grades to students?"
        description={`Students on the ${graded} graded ${graded === 1 ? "team" : "teams"} will see their team's marks, your feedback and their own grade, and get a notification.`}
        onConfirm={() => release(true)} />
    </Card>
  );
}

// ─── Student card ────────────────────────────────────────────────────────

/** The student's released grade; renders nothing until the instructor releases grades. */
export function MyGradeCard({ courseId }: { courseId: string }) {
  const [grade, setGrade] = React.useState<MyGrade | null>(null);
  const live = useLive("courses", "rubric_criteria", "team_grades", "student_grade_factors");
  React.useEffect(() => {
    getMyGrade(courseId).then(setGrade).catch((err) => console.error("Loading grade failed:", err));
  }, [courseId, live]);
  if (!grade) return null;

  const team100 = teamPercent(grade.criteria, Object.fromEntries(Object.entries(grade.scores).map(([k, v]) => [k, v.points])));
  const mine = finalPercent(team100, grade.factor);
  return (
    <Card className="p-5 sm:p-6">
      <CardTitle>Your grade</CardTitle>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-sky px-4 py-3">
          <p className="text-sm font-semibold text-foreground/80">Your grade</p>
          <p className="font-display text-4xl font-semibold">{pct(mine)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground/80">{grade.teamName}&apos;s grade</p>
          <p className="font-display text-4xl font-semibold">{pct(team100)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Your grade is your team&apos;s grade adjusted for your share of the work.</p>
      <ul className="mt-4 divide-y">
        {grade.criteria.map((c) => (
          <li key={c.id} className="py-3">
            <p className="flex items-baseline justify-between gap-3 font-semibold">{c.name}<span className="tabular-nums">{grade.scores[c.id]?.points ?? "—"} / {c.maxPoints}</span></p>
            {grade.scores[c.id]?.feedback && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{grade.scores[c.id].feedback}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
