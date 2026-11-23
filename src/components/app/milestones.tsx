"use client";

import * as React from "react";
import { CalendarCheck, CalendarPlus, ChatsCircle, Check, CheckCircle, Clock, DotsThree, Flag, PencilSimple, Plus, Trash, Tray, UploadSimple, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { decideExtension, deleteMilestone, getMilestones, requestExtension, saveMilestone, setMilestoneDone } from "@/app/actions";
import { cn, dueInfo, toneText } from "@/lib/utils";
import { dueFor, type Extension, type Milestone, type Team } from "@/lib/types";
import { HandInDialog, isLate, SubmissionSummary, SubmissionsReview } from "@/components/app/submissions";
import { RetroDialog, RetroReview } from "@/components/app/retros";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";
import { useT } from "@/components/locale";
import { intl, msg, t, num } from "@/lib/i18n";

type Status = "done" | "late" | "upcoming";

const today = () => new Date().toISOString().slice(0, 10);
function statusOf(m: Milestone, teamId: string): Status {
  if (m.completions.some((c) => c.teamId === teamId)) return "done";
  return dueFor(m, teamId) < today() ? "late" : "upcoming";
}
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(intl(), { weekday: "short", day: "numeric", month: "short" });
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
const chip: Record<Status, string> = {
  done: "bg-sage text-success",
  late: "bg-rose text-destructive",
  upcoming: "bg-muted text-muted-foreground",
};
const statusLabel: Record<Status, string> = { done: msg("Done"), late: msg("Late"), upcoming: msg("Not yet") };

function DateBlock({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00`);
  return (
    <span className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-butter py-1.5 leading-none">
      <span className="text-[0.625rem] font-bold uppercase tracking-wider text-foreground/70">{d.toLocaleDateString(intl(), { month: "short" })}</span>
      <span className="mt-0.5 font-display text-xl font-semibold">{num(d.getDate())}</span>
    </span>
  );
}

function MilestoneDialog({ courseId, milestone, open, onOpenChange, onSaved }: {
  courseId: string; milestone: Milestone | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = React.useState({ title: milestone?.title ?? "", description: milestone?.description ?? "", dueDate: milestone?.dueDate ?? "", requiresSubmission: milestone?.requiresSubmission ?? false });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError(t("Give the milestone a title."));
    if (!form.dueDate) return setError(t("Pick a due date."));
    setSaving(true);
    try {
      await saveMilestone(courseId, form, milestone?.id);
      toast.success(milestone ? t("Milestone updated") : t("Milestone added. Students were notified."));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Saving milestone failed:", err);
      toast.error(t("Could not save the milestone"));
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? t("Edit milestone") : t("New milestone")}</DialogTitle>
          <DialogDescription>{t("A checkpoint every team works towards. Teams mark it done; you see who is on track.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label={t("Title")} htmlFor="ms-title" error={error}>
            <Input id="ms-title" value={form.title} maxLength={120} autoFocus placeholder={t("e.g. Project proposal")}
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(null); }} />
          </Field>
          <Field label={t("Due date")} htmlFor="ms-due">
            <Input id="ms-due" type="date" value={form.dueDate} onChange={(e) => { setForm({ ...form, dueDate: e.target.value }); setError(null); }} />
          </Field>
          <Field label={t("What to hand in")} htmlFor="ms-desc" optional>
            <Textarea id="ms-desc" value={form.description} maxLength={1000} placeholder={t("e.g. Two pages: problem, users, planned features.")}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors hover:bg-accent/50">
            <input type="checkbox" checked={form.requiresSubmission} onChange={(e) => setForm({ ...form, requiresSubmission: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            <span>
              <span className="block text-sm font-bold">{t("Teams hand in work")}</span>
              <span className="block text-xs text-muted-foreground">{t("Each team uploads a file or shares a link. Late hand-ins are flagged, and you can leave feedback.")}</span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{milestone ? t("Save changes") : t("Add milestone")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtensionDialog({ team, milestone, open, onOpenChange, onSent }: {
  team: Team; milestone: Milestone; open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void;
}) {
  const { t } = useT();
  const due = dueFor(milestone, team.id);
  const min = [nextDay(due), today()].sort()[1];
  const [newDate, setNewDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || newDate < min) return setError(t("Pick a date after the current due date."));
    if (!reason.trim()) return setError(t("Say why the team needs more time."));
    setSaving(true);
    try {
      await requestExtension(team.id, milestone.id, { newDate, reason });
      toast.success(t("Request sent to your instructor"));
      onSent();
      onOpenChange(false);
    } catch (err) {
      console.error("Asking for more time failed:", err);
      toast.error(t("Could not send the request"));
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Ask for more time: {title}", { title: milestone.title })}</DialogTitle>
          <DialogDescription>{t("{team} · due {date}. Your instructor approves or declines, and the whole team is told.", { team: team.name, date: dayLabel(due) })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} noValidate className="space-y-4">
          <Field label={t("New due date")} htmlFor="ext-date" error={error}>
            <Input id="ext-date" type="date" min={min} value={newDate} autoFocus onChange={(e) => { setNewDate(e.target.value); setError(null); }} />
          </Field>
          <Field label={t("Why the team needs it")} htmlFor="ext-reason">
            <Textarea id="ext-reason" value={reason} maxLength={1000} placeholder={t("e.g. Our user tests moved to next week.")}
              onChange={(e) => { setReason(e.target.value); setError(null); }} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{t("Send request")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Where the team's request for more time stands. */
function ExtensionNote({ x, original }: { x: Extension; original: string }) {
  const { t } = useT();
  const extended = x.approvedDate && t("Extended from {from} to {to}.", { from: dayLabel(original), to: dayLabel(x.approvedDate) });
  if (x.status === "pending") {
    return <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Clock weight="bold" className="size-3.5 shrink-0" aria-hidden />
      {extended ? `${extended} ` : ""}{t("Asked for more time, until {date}. Waiting for your instructor.", { date: dayLabel(x.newDate) })}</p>;
  }
  if (x.status === "approved") {
    return <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-success"><CalendarPlus weight="bold" className="size-3.5 shrink-0" aria-hidden />{extended}</p>;
  }
  return <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-destructive"><X weight="bold" className="size-3.5 shrink-0" aria-hidden />
    {extended ? `${extended} ` : ""}{t("Your request for more time was declined.")}</p>;
}

/** Course milestones. Instructors manage them and see every team's status; a student marks their own team's. */
export function Milestones({ courseId, teams, instructor, canEdit, readOnly = false }: { courseId: string; teams: Team[]; instructor: boolean; canEdit: boolean; readOnly?: boolean }) {
  const { t } = useT();
  const [items, setItems] = React.useState<Milestone[] | null>(null);
  const [editing, setEditing] = React.useState<Milestone | null | undefined>(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = React.useState<Milestone | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [handingIn, setHandingIn] = React.useState<Milestone | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [extending, setExtending] = React.useState<Milestone | null>(null);
  const [retro, setRetro] = React.useState<Milestone | null>(null);
  const reviewing = items?.find((m) => m.id === reviewingId) ?? null; // follows reloads, so saved feedback shows
  const myTeam = instructor ? null : teams[0] ?? null;

  const load = React.useCallback(() => getMilestones(courseId).then(setItems).catch((err) => {
    console.error("Loading milestones failed:", err);
    setItems((x) => x ?? []);
  }), [courseId]);
  const live = useLive("course_milestones", "team_milestones", "submissions", "deadline_extensions", "team_retros");
  React.useEffect(() => { load(); }, [load, live]);

  async function toggle(m: Milestone, done: boolean) {
    if (!myTeam) return;
    setBusy(m.id);
    try {
      await setMilestoneDone(myTeam.id, m.id, done);
      await load();
    } catch (err) {
      console.error("Updating milestone failed:", err);
      toast.error(t("Could not update the milestone"));
    }
    setBusy(null);
  }

  async function decide(teamId: string, m: Milestone, approve: boolean) {
    setBusy(`${m.id}:${teamId}`);
    try {
      await decideExtension(teamId, m.id, approve);
      toast.success(approve ? t("More time approved. The team was told.") : t("Request declined. The team was told."));
      await load();
    } catch (err) {
      console.error("Deciding the extension failed:", err);
      toast.error(t("Could not save your decision"));
    }
    setBusy(null);
  }

  async function remove() {
    if (!deleting) return;
    try {
      await deleteMilestone(deleting.id);
      toast.success(t("Milestone deleted"));
      await load();
    } catch (err) {
      console.error("Deleting milestone failed:", err);
      toast.error(t("Could not delete the milestone"));
    }
  }

  // Students see nothing until the instructor adds the first milestone.
  if (!instructor && items?.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-butter text-warm-text"><Flag weight="fill" className="size-[1.125rem]" aria-hidden /></span>
          {t("Milestones")}
          {items && items.length > 0 && <Badge variant="muted">{num(items.length)}</Badge>}
        </h2>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(null)}><Plus aria-hidden /> {t("Add milestone")}</Button>}
      </div>

      {!items ? (
        <div className="mt-4 space-y-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : items.length === 0 ? (
        <button type="button" onClick={() => setEditing(null)} disabled={!canEdit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground transition-colors enabled:hover:border-primary/40 enabled:hover:text-primary">
          <CalendarCheck aria-hidden className="size-4" /> {canEdit ? t("Add the first checkpoint, like a proposal or a demo") : t("No milestones yet")}
        </button>
      ) : (
        <ol className="mt-4 divide-y">
          {items.map((m) => {
            const myDue = myTeam ? dueFor(m, myTeam.id) : m.dueDate;
            const due = dueInfo(myDue);
            const doneCount = teams.filter((tt) => statusOf(m, tt.id) === "done").length;
            const mine = myTeam ? statusOf(m, myTeam.id) : null;
            const mySub = myTeam ? m.submissions.find((x) => x.teamId === myTeam.id) ?? null : null;
            const myExt = myTeam ? m.extensions.find((x) => x.teamId === myTeam.id) : undefined;
            const overdueFor = (teamId: string) => dueFor(m, teamId) < today();
            const pending = instructor ? m.extensions.filter((x) => x.status === "pending") : [];
            const extendedTeams = instructor ? teams.filter((tt) => dueFor(m, tt.id) !== m.dueDate) : [];
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
                <DateBlock date={myDue} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {m.title}
                    {m.requiresSubmission && <span className="inline-flex items-center gap-1 rounded-full bg-peach px-2 py-0.5 text-[0.6875rem] font-bold text-warm-text"><Tray weight="fill" className="size-3" aria-hidden />{t("Hand-in")}</span>}
                  </p>
                  {m.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{m.description}</p>}
                  {due && mine !== "done" && <p className={cn("mt-1 text-xs font-semibold", toneText[due.tone])}>{due.label}</p>}
                  {myExt && mine !== "done" && <ExtensionNote x={myExt} original={m.dueDate} />}
                  {mySub && <div className="mt-3"><SubmissionSummary sub={mySub} dueDate={myDue} /></div>}
                  {instructor && teams.length > 0 && m.requiresSubmission && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t("Hand-ins for {title}", { title: m.title })}>
                      {teams.map((tt) => {
                        const x = m.submissions.find((y) => y.teamId === tt.id);
                        const late = x && isLate(x.submittedAt, dueFor(m, tt.id));
                        const overdue = overdueFor(tt.id);
                        const label = x ? (late ? t("Handed in late") : t("Handed in")) : overdue ? t("Missing") : t("Not yet");
                        return (
                          <li key={tt.id} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            x ? (late ? "bg-butter text-warning" : "bg-sage text-success") : overdue ? "bg-rose text-destructive" : "bg-muted text-muted-foreground")}>
                            {x && (late ? <Clock weight="bold" className="size-3" aria-hidden /> : <Check weight="bold" className="size-3" aria-hidden />)}{tt.name}<span className="sr-only">: {label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {instructor && teams.length > 0 && !m.requiresSubmission && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t("Team status for {title}", { title: m.title })}>
                      {teams.map((tt) => {
                        const st = statusOf(m, tt.id);
                        return (
                          <li key={tt.id} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", chip[st])}>
                            {st === "done" && <Check weight="bold" className="size-3" aria-hidden />}{tt.name}<span className="sr-only">: {t(statusLabel[st])}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {extendedTeams.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarPlus weight="bold" className="size-3.5 shrink-0" aria-hidden />
                      {t("More time: {list}", { list: extendedTeams.map((tt) => `${tt.name} (${dayLabel(dueFor(m, tt.id))})`).join(", ") })}</p>
                  )}
                  {pending.map((x) => {
                    const tt = teams.find((y) => y.id === x.teamId);
                    if (!tt) return null;
                    return (
                      <div key={x.teamId} className="mt-3 rounded-2xl border bg-sky/40 p-3.5" aria-label={t("Request for more time from {team}", { team: tt.name })}>
                        <p className="text-sm font-bold">{t("{team} asks for more time, until {date}", { team: tt.name, date: dayLabel(x.newDate) })}</p>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{x.reason}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{x.requestedByName}</p>
                        {canEdit && (
                          <div className="mt-2.5 flex gap-2">
                            <Button size="sm" loading={busy === `${m.id}:${tt.id}`} onClick={() => decide(tt.id, m, true)}>{t("Approve")}</Button>
                            <Button size="sm" variant="outline" disabled={busy === `${m.id}:${tt.id}`} onClick={() => decide(tt.id, m, false)}>{t("Decline")}</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* A retrospective once the milestone is over for the team: done, handed in, or past its date. */}
                  {myTeam && !readOnly && (mine === "done" || mySub || overdueFor(myTeam.id)) && (
                    <Button size="sm" variant="ghost" onClick={() => setRetro(m)}>
                      {m.retroTeams.includes(myTeam.id) ? <CheckCircle weight="fill" className="text-success" aria-hidden /> : <ChatsCircle aria-hidden />} {t("Retrospective")}
                    </Button>
                  )}
                  {instructor && teams.length > 0 && m.retroTeams.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setRetro(m)}>
                      <ChatsCircle aria-hidden /> {t("Retros")} <span className="tabular-nums text-muted-foreground">{num(m.retroTeams.length)}/{num(teams.length)}</span>
                    </Button>
                  )}
                  {myTeam && !readOnly && mine !== "done" && myExt?.status !== "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => setExtending(m)}><CalendarPlus aria-hidden /> {t("Ask for more time")}</Button>
                  )}
                  {instructor && teams.length > 0 && (m.requiresSubmission ? (
                    <Button size="sm" variant="outline" onClick={() => setReviewingId(m.id)}>
                      <Tray aria-hidden /> {t("Review")} <span className="tabular-nums text-muted-foreground">{num(m.submissions.length)}/{num(teams.length)}</span>
                    </Button>
                  ) : (
                    <span className="text-sm font-bold tabular-nums">{num(doneCount)}/{num(teams.length)}<span className="ml-1 text-xs font-medium text-muted-foreground">{t("done")}</span></span>
                  ))}
                  {myTeam && m.requiresSubmission && !readOnly && (
                    <Button size="sm" variant={mySub ? "outline" : "default"} onClick={() => setHandingIn(m)}>
                      <UploadSimple aria-hidden /> {mySub ? t("New version") : t("Hand in")}
                    </Button>
                  )}
                  {myTeam && !m.requiresSubmission && !readOnly && (mine === "done" ? (
                    <Tooltip label={t("Mark as not done")}>
                      <Button size="sm" variant="secondary" className="bg-sage text-success hover:bg-sage/80" loading={busy === m.id} onClick={() => toggle(m, false)}>
                        {busy !== m.id && <CheckCircle weight="fill" aria-hidden />} {t("Done")}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button size="sm" variant="outline" loading={busy === m.id} onClick={() => toggle(m, true)}>{t("Mark done")}</Button>
                  ))}
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("Options for {title}", { title: m.title })}><DotsThree weight="bold" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(m)}><PencilSimple aria-hidden /> {t("Edit")}</DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setDeleting(m)}><Trash aria-hidden /> {t("Delete")}</DropdownMenuItem>
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
      {myTeam && retro && (
        <RetroDialog key={retro.id} team={myTeam} milestone={retro} open onOpenChange={(o) => { if (!o) setRetro(null); }} onSaved={load} />
      )}
      {instructor && retro && <RetroReview key={retro.id} milestone={retro} teams={teams} open onOpenChange={(o) => { if (!o) setRetro(null); }} />}
      {myTeam && extending && (
        <ExtensionDialog key={extending.id} team={myTeam} milestone={extending} open onOpenChange={(o) => { if (!o) setExtending(null); }} onSent={load} />
      )}
      {instructor && reviewing && (
        <SubmissionsReview milestone={reviewing} teams={teams} open onOpenChange={(o) => { if (!o) setReviewingId(null); }} onChanged={load} />
      )}
      {canEdit && editing !== undefined && (
        <MilestoneDialog key={editing?.id ?? "new"} courseId={courseId} milestone={editing} open onOpenChange={(o) => { if (!o) setEditing(undefined); }} onSaved={load} />
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title={t("Delete \"{title}\"?", { title: deleting?.title })}
        description={t("Teams lose their done marks for this milestone. This can't be undone.")} onConfirm={remove} />
    </Card>
  );
}
