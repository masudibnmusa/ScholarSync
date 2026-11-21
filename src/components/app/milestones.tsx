"use client";

import * as React from "react";
import { CalendarCheck, Check, CheckCircle, Clock, DotsThree, Flag, PencilSimple, Plus, Trash, Tray, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { deleteMilestone, getMilestones, saveMilestone, setMilestoneDone } from "@/app/actions";
import { cn, dueInfo, toneText } from "@/lib/utils";
import type { Milestone, Team } from "@/lib/types";
import { HandInDialog, isLate, SubmissionSummary, SubmissionsReview } from "@/components/app/submissions";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "done" | "late" | "upcoming";

const today = () => new Date().toISOString().slice(0, 10);
function statusOf(m: Milestone, teamId: string): Status {
  if (m.completions.some((c) => c.teamId === teamId)) return "done";
  return m.dueDate < today() ? "late" : "upcoming";
}
const chip: Record<Status, string> = {
  done: "bg-sage text-success",
  late: "bg-rose text-destructive",
  upcoming: "bg-muted text-muted-foreground",
};
const statusLabel: Record<Status, string> = { done: "Done", late: "Late", upcoming: "Not yet" };

function DateBlock({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00`);
  return (
    <span className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-butter py-1.5 leading-none">
      <span className="text-[0.625rem] font-bold uppercase tracking-wider text-foreground/70">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="mt-0.5 font-display text-xl font-semibold">{d.getDate()}</span>
    </span>
  );
}

function MilestoneDialog({ courseId, milestone, open, onOpenChange, onSaved }: {
  courseId: string; milestone: Milestone | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [form, setForm] = React.useState({ title: milestone?.title ?? "", description: milestone?.description ?? "", dueDate: milestone?.dueDate ?? "", requiresSubmission: milestone?.requiresSubmission ?? false });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the milestone a title.");
    if (!form.dueDate) return setError("Pick a due date.");
    setSaving(true);
    try {
      await saveMilestone(courseId, form, milestone?.id);
      toast.success(milestone ? "Milestone updated" : "Milestone added. Students were notified.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Saving milestone failed:", err);
      toast.error("Could not save the milestone");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? "Edit milestone" : "New milestone"}</DialogTitle>
          <DialogDescription>A checkpoint every team works towards. Teams mark it done; you see who is on track.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="Title" htmlFor="ms-title" error={error}>
            <Input id="ms-title" value={form.title} maxLength={120} autoFocus placeholder="e.g. Project proposal"
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(null); }} />
          </Field>
          <Field label="Due date" htmlFor="ms-due">
            <Input id="ms-due" type="date" value={form.dueDate} onChange={(e) => { setForm({ ...form, dueDate: e.target.value }); setError(null); }} />
          </Field>
          <Field label="What to hand in" htmlFor="ms-desc" optional>
            <Textarea id="ms-desc" value={form.description} maxLength={1000} placeholder="e.g. Two pages: problem, users, planned features."
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors hover:bg-accent/50">
            <input type="checkbox" checked={form.requiresSubmission} onChange={(e) => setForm({ ...form, requiresSubmission: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            <span>
              <span className="block text-sm font-bold">Teams hand in work</span>
              <span className="block text-xs text-muted-foreground">Each team uploads a file or shares a link. Late hand-ins are flagged, and you can leave feedback.</span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{milestone ? "Save changes" : "Add milestone"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Course milestones. Instructors manage them and see every team's status; a student marks their own team's. */
export function Milestones({ courseId, teams, instructor, canEdit, readOnly = false }: { courseId: string; teams: Team[]; instructor: boolean; canEdit: boolean; readOnly?: boolean }) {
  const [items, setItems] = React.useState<Milestone[] | null>(null);
  const [editing, setEditing] = React.useState<Milestone | null | undefined>(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = React.useState<Milestone | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [handingIn, setHandingIn] = React.useState<Milestone | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const reviewing = items?.find((m) => m.id === reviewingId) ?? null; // follows reloads, so saved feedback shows
  const myTeam = instructor ? null : teams[0] ?? null;

  const load = React.useCallback(() => getMilestones(courseId).then(setItems).catch((err) => {
    console.error("Loading milestones failed:", err);
    setItems((x) => x ?? []);
  }), [courseId]);
  React.useEffect(() => { load(); }, [load]);

  async function toggle(m: Milestone, done: boolean) {
    if (!myTeam) return;
    setBusy(m.id);
    try {
      await setMilestoneDone(myTeam.id, m.id, done);
      await load();
    } catch (err) {
      console.error("Updating milestone failed:", err);
      toast.error("Could not update the milestone");
    }
    setBusy(null);
  }

  async function remove() {
    if (!deleting) return;
    try {
      await deleteMilestone(deleting.id);
      toast.success("Milestone deleted");
      await load();
    } catch (err) {
      console.error("Deleting milestone failed:", err);
      toast.error("Could not delete the milestone");
    }
  }

  // Students see nothing until the instructor adds the first milestone.
  if (!instructor && items?.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-butter text-warm-text"><Flag weight="fill" className="size-[1.125rem]" aria-hidden /></span>
          Milestones
          {items && items.length > 0 && <Badge variant="muted">{items.length}</Badge>}
        </h2>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(null)}><Plus aria-hidden /> Add milestone</Button>}
      </div>

      {!items ? (
        <div className="mt-4 space-y-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : items.length === 0 ? (
        <button type="button" onClick={() => setEditing(null)} disabled={!canEdit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground transition-colors enabled:hover:border-primary/40 enabled:hover:text-primary">
          <CalendarCheck aria-hidden className="size-4" /> {canEdit ? "Add the first checkpoint, like a proposal or a demo" : "No milestones yet"}
        </button>
      ) : (
        <ol className="mt-4 divide-y">
          {items.map((m) => {
            const due = dueInfo(m.dueDate);
            const doneCount = teams.filter((t) => statusOf(m, t.id) === "done").length;
            const mine = myTeam ? statusOf(m, myTeam.id) : null;
            const mySub = myTeam ? m.submissions.find((x) => x.teamId === myTeam.id) ?? null : null;
            const overdue = m.dueDate < today();
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
                <DateBlock date={m.dueDate} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {m.title}
                    {m.requiresSubmission && <span className="inline-flex items-center gap-1 rounded-full bg-peach px-2 py-0.5 text-[0.6875rem] font-bold text-warm-text"><Tray weight="fill" className="size-3" aria-hidden />Hand-in</span>}
                  </p>
                  {m.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{m.description}</p>}
                  {due && mine !== "done" && <p className={cn("mt-1 text-xs font-semibold", toneText[due.tone])}>{due.label}</p>}
                  {mySub && <div className="mt-3"><SubmissionSummary sub={mySub} dueDate={m.dueDate} /></div>}
                  {instructor && teams.length > 0 && m.requiresSubmission && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Hand-ins for ${m.title}`}>
                      {teams.map((t) => {
                        const x = m.submissions.find((y) => y.teamId === t.id);
                        const late = x && isLate(x.submittedAt, m.dueDate);
                        const label = x ? (late ? "Handed in late" : "Handed in") : overdue ? "Missing" : "Not yet";
                        return (
                          <li key={t.id} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            x ? (late ? "bg-butter text-warning" : "bg-sage text-success") : overdue ? "bg-rose text-destructive" : "bg-muted text-muted-foreground")}>
                            {x && (late ? <Clock weight="bold" className="size-3" aria-hidden /> : <Check weight="bold" className="size-3" aria-hidden />)}{t.name}<span className="sr-only">: {label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {instructor && teams.length > 0 && !m.requiresSubmission && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Team status for ${m.title}`}>
                      {teams.map((t) => {
                        const st = statusOf(m, t.id);
                        return (
                          <li key={t.id} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", chip[st])}>
                            {st === "done" && <Check weight="bold" className="size-3" aria-hidden />}{t.name}<span className="sr-only">: {statusLabel[st]}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {instructor && teams.length > 0 && (m.requiresSubmission ? (
                    <Button size="sm" variant="outline" onClick={() => setReviewingId(m.id)}>
                      <Tray aria-hidden /> Review <span className="tabular-nums text-muted-foreground">{m.submissions.length}/{teams.length}</span>
                    </Button>
                  ) : (
                    <span className="text-sm font-bold tabular-nums">{doneCount}/{teams.length}<span className="ml-1 text-xs font-medium text-muted-foreground">done</span></span>
                  ))}
                  {myTeam && m.requiresSubmission && !readOnly && (
                    <Button size="sm" variant={mySub ? "outline" : "default"} onClick={() => setHandingIn(m)}>
                      <UploadSimple aria-hidden /> {mySub ? "New version" : "Hand in"}
                    </Button>
                  )}
                  {myTeam && !m.requiresSubmission && !readOnly && (mine === "done" ? (
                    <Tooltip label="Mark as not done">
                      <Button size="sm" variant="secondary" className="bg-sage text-success hover:bg-sage/80" loading={busy === m.id} onClick={() => toggle(m, false)}>
                        {busy !== m.id && <CheckCircle weight="fill" aria-hidden />} Done
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button size="sm" variant="outline" loading={busy === m.id} onClick={() => toggle(m, true)}>Mark done</Button>
                  ))}
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${m.title}`}><DotsThree weight="bold" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(m)}><PencilSimple aria-hidden /> Edit</DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setDeleting(m)}><Trash aria-hidden /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {myTeam && handingIn && (
        <HandInDialog key={handingIn.id} team={myTeam} milestone={handingIn} current={handingIn.submissions.find((x) => x.teamId === myTeam.id) ?? null}
          open onOpenChange={(o) => { if (!o) setHandingIn(null); }} onDone={load} />
      )}
      {instructor && reviewing && (
        <SubmissionsReview milestone={reviewing} teams={teams} open onOpenChange={(o) => { if (!o) setReviewingId(null); }} onChanged={load} />
      )}
      {canEdit && editing !== undefined && (
        <MilestoneDialog key={editing?.id ?? "new"} courseId={courseId} milestone={editing} open onOpenChange={(o) => { if (!o) setEditing(undefined); }} onSaved={load} />
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title={`Delete "${deleting?.title}"?`}
        description="Teams lose their done marks for this milestone. This can't be undone." onConfirm={remove} />
    </Card>
  );
}
