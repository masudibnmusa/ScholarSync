"use client";

import * as React from "react";
import { ChatCircleText, CheckCircle, ClipboardText, Clock, CopySimple, DownloadSimple, LinkSimple, Paperclip, UploadSimple, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { getRubricChecks, getSimilarityHints, saveSubmissionFeedback, setRubricCheck, submitWork } from "@/app/actions";
import { MAX_FILE_BYTES, useAppStore, useLive } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n";
import { dueFor, type Milestone, type RubricCheck, type Submission, type Team } from "@/lib/types";
import type { SimilarPair } from "@/lib/similarity";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useT } from "@/components/locale";
import {intl, t } from "@/lib/i18n";

/** Late = handed in after the end of the due day, in the viewer's time zone (like every due date in the app). */
export function isLate(submittedAt: string, dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(submittedAt) > new Date(y, m - 1, d, 23, 59, 59, 999);
}

const when = (iso: string) => new Date(iso).toLocaleString(intl(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const size = (b: number) => (b < 1024 ** 2 ? `${num(Math.max(1, Math.round(b / 1024)))} KB` : `${num(b / 1024 ** 2, 1)} MB`);

export function TimingBadge({ sub, dueDate }: { sub: Submission; dueDate: string }) {
  const { t } = useT();
  const late = isLate(sub.submittedAt, dueDate);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", late ? "bg-butter text-warning" : "bg-sage text-success")}>
      {late ? <Clock weight="bold" className="size-3" aria-hidden /> : <CheckCircle weight="fill" className="size-3" aria-hidden />}
      {late ? t("Late") : t("On time")}
    </span>
  );
}

/** What was handed in: the file (download), the link, the note, and the instructor's feedback. */
export function SubmissionSummary({ sub, dueDate, showFeedback = true }: { sub: Submission; dueDate: string; showFeedback?: boolean }) {
  const { t } = useT();
  const download = useAppStore((s) => s.downloadFile);
  const stale = sub.feedbackAt && new Date(sub.feedbackAt) < new Date(sub.submittedAt);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <TimingBadge sub={sub} dueDate={dueDate} />
        <span>{t("Handed in {when} by {name}", { when: when(sub.submittedAt), name: sub.submittedByName })}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {sub.storagePath && sub.fileName && (
          <button type="button" onClick={() => download(sub.storagePath!)}
            className="inline-flex max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary">
            <Paperclip className="size-4 shrink-0" aria-hidden /><span className="truncate">{sub.fileName}</span>
            {sub.fileSize != null && <span className="shrink-0 text-xs font-medium text-muted-foreground">{size(sub.fileSize)}</span>}
            <DownloadSimple className="size-4 shrink-0" aria-hidden /><span className="sr-only">{t("Download")}</span>
          </button>
        )}
        {sub.link && (
          <a href={sub.link} target="_blank" rel="noopener noreferrer nofollow"
            className="inline-flex max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary">
            <LinkSimple className="size-4 shrink-0" aria-hidden /><span className="truncate">{sub.link.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
      </div>
      {sub.note && <p className="whitespace-pre-line text-sm text-foreground/85">{sub.note}</p>}
      {showFeedback && sub.feedback && (
        <div className="rounded-xl bg-sky/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-info"><ChatCircleText weight="fill" className="size-4" aria-hidden />{t("Instructor feedback")}{stale && <span className="font-medium text-muted-foreground"> {t("· on an earlier version")}</span>}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{sub.feedback}</p>
        </div>
      )}
    </div>
  );
}

/** The course's grading criteria as a checklist the team ticks before handing in. Shared and live; hidden without a rubric. */
function RubricChecklist({ team, milestone }: { team: Team; milestone: Milestone }) {
  const { t } = useT();
  const [items, setItems] = React.useState<RubricCheck[] | null>(null);
  const load = React.useCallback(() => getRubricChecks(team.id, milestone.id).then(setItems).catch((err) => {
    console.error("Loading the rubric checklist failed:", err);
    setItems((x) => x ?? []);
  }), [team.id, milestone.id]);
  const live = useLive("rubric_checks", "rubric_criteria");
  React.useEffect(() => { load(); }, [load, live]);

  async function toggle(item: RubricCheck) {
    const checked = !item.checkedBy;
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, checkedBy: checked ? t("You") : null } : i)) ?? null);
    try {
      await setRubricCheck(team.id, milestone.id, item.id, checked);
    } catch (err) {
      console.error("Ticking the criterion failed:", err);
      toast.error(t("Could not update the checklist"));
    }
    await load();
  }

  if (!items?.length) return null;
  const done = items.filter((i) => i.checkedBy).length;
  return (
    <section aria-labelledby="rubric-check-title" className="rounded-2xl bg-muted/50 p-3">
      <h3 id="rubric-check-title" className="flex items-center gap-1.5 text-sm font-bold">
        <ClipboardText weight="duotone" className="size-4 text-primary" aria-hidden /> {t("Check against the rubric")}
        <span className={cn("ml-auto text-xs font-semibold tabular-nums", done === items.length ? "text-success" : "text-muted-foreground")}>
          {t("{done} of {total}", { done, total: items.length })}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("How your instructor grades it. Tick each one your team has covered; your teammates see the ticks too.")}</p>
      <ul className="mt-2 space-y-1">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-accent/50">
              <input type="checkbox" checked={!!i.checkedBy} disabled={team.courseArchived} onChange={() => toggle(i)} className="size-4 shrink-0 accent-[var(--primary)]" />
              <span className={cn("min-w-0 flex-1", i.checkedBy && "text-muted-foreground")}>{i.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{i.checkedBy ? i.checkedBy : t("{n} pts", { n: i.maxPoints })}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Student: hand in a file and/or a link with a note. Handing in again replaces the earlier version. */
export function HandInDialog({ team, milestone, current, open, onOpenChange, onDone }: {
  team: Team; milestone: Milestone; current: Submission | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const { t } = useT();
  const [file, setFile] = React.useState<File | null>(null);
  const [keepFile, setKeepFile] = React.useState(!!current?.storagePath);
  const [link, setLink] = React.useState(current?.link ?? "");
  const [note, setNote] = React.useState(current?.note ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const due = dueFor(milestone, team.id);
  const late = new Date() > new Date(`${due}T23:59:59.999`);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setError(t("{name} is over 50 MB.", { name: f.name }));
    setFile(f);
    setKeepFile(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) return setError(t("Use a web link starting with http:// or https://"));
    if (!file && !keepFile && !url) return setError(t("Attach a file or add a link."));
    setSaving(true);
    setError(null);
    const bucket = supabaseBrowser().storage.from("team-files");
    let uploaded: string | null = null;
    try {
      let fileInfo = keepFile && current?.storagePath && current.fileName
        ? { path: current.storagePath, name: current.fileName, size: current.fileSize ?? 0 } : null;
      if (file) {
        uploaded = `${team.id}/submissions/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await bucket.upload(uploaded, file, { contentType: file.type || undefined });
        if (upErr) throw upErr;
        fileInfo = { path: uploaded, name: file.name, size: file.size };
      }
      const replaced = await submitWork(team.id, milestone.id, { link: url || null, file: fileInfo, note });
      // shortcut: best effort; only the person who uploaded a file may delete it, so a teammate's old version can stay in storage.
      if (replaced) await bucket.remove([replaced]);
      toast.success(current ? t("New version handed in") : t("Handed in"), { description: late ? t("It's after the due date, so it's marked late.") : t("Your instructor was notified.") });
      onDone();
      onOpenChange(false);
    } catch (err) {
      console.error("Hand-in failed:", err);
      if (uploaded) await bucket.remove([uploaded]); // don't leave an orphaned file behind
      setError(err instanceof Error && /archived/i.test(err.message) ? t("This course is archived, so nothing can be handed in.") : t("Could not hand in. Please try again."));
    }
    setSaving(false);
  }

  const shownFile = file ? { name: file.name, size: file.size } : keepFile && current?.fileName ? { name: current.fileName, size: current.fileSize ?? 0 } : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current ? t("Hand in a new version") : t("Hand in")}: {milestone.title}</DialogTitle>
          <DialogDescription>
            {team.name} {t("· due")} {new Date(`${due}T00:00:00`).toLocaleDateString(intl(), { weekday: "short", day: "numeric", month: "long" })}
            {current ? t(". This replaces your earlier hand-in.") : "."}
          </DialogDescription>
        </DialogHeader>
        {late && (
          <p className="flex items-start gap-2 rounded-xl bg-butter/70 px-3 py-2 text-sm text-warning">
            <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />{t("The due date has passed. You can still hand in, but it will be marked late.")}
          </p>
        )}
        <RubricChecklist team={team} milestone={milestone} />
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label={t("File")} htmlFor="handin-file" optional hint={t("Any file up to 50 MB: a report, slides, a zip of your code…")}>
            <input ref={input} id="handin-file" type="file" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {shownFile ? (
              <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{shownFile.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{size(shownFile.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Remove {name}", { name: shownFile.name })} onClick={() => { setFile(null); setKeepFile(false); }}><X aria-hidden /></Button>
              </div>
            ) : (
              <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                <UploadSimple className="size-5" aria-hidden /><span className="font-semibold">{t("Choose a file")}</span><span className="text-xs">{t("or drop it here")}</span>
              </button>
            )}
          </Field>
          <Field label={t("Link")} htmlFor="handin-link" optional hint={t("A repository, a shared document or a demo video.")}>
            <Input id="handin-link" type="url" inputMode="url" value={link} onChange={(e) => { setLink(e.target.value); setError(null); }} placeholder={t("https://github.com/your-team/project")} maxLength={2000} />
          </Field>
          <Field label={t("Note to your instructor")} htmlFor="handin-note" optional error={error}>
            <Textarea id="handin-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder={t("Anything they should know: what's done, what's missing…")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{!saving && <UploadSimple aria-hidden />} {current ? t("Hand in new version") : t("Hand in")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ team, milestone, sub, onSaved }: { team: Team; milestone: Milestone; sub: Submission; onSaved: () => void }) {
  const { t } = useT();
  const [text, setText] = React.useState(sub.feedback);
  const [saving, setSaving] = React.useState(false);
  const id = `feedback-${team.id}`;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSubmissionFeedback(team.id, milestone.id, text);
      toast.success(t("Feedback saved for {name}", { name: team.name }), { description: text.trim() ? t("The team was notified.") : undefined });
      onSaved();
    } catch (err) {
      console.error("Saving feedback failed:", err);
      toast.error(t("Could not save the feedback"));
    }
    setSaving(false);
  }
  return (
    <form onSubmit={save} className="space-y-2">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">{t("Feedback to")} {team.name}</label>
      <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3} placeholder={t("What works, what to improve…")} />
      <div className="flex items-center justify-end gap-2">
        {sub.feedbackAt && new Date(sub.feedbackAt) < new Date(sub.submittedAt) && <span className="mr-auto text-xs text-warm-text">{t("They handed in a new version since your feedback.")}</span>}
        <Button type="submit" size="sm" loading={saving} disabled={text.trim() === sub.feedback.trim()}>{t("Save feedback")}</Button>
      </div>
    </form>
  );
}

/** Instructor: every team's hand-in for one milestone, with feedback. */
/** Staff: compares the hand-ins on request and lists pairs that look alike. A hint to look closer, not a verdict. */
function SimilarityCheck({ milestone, teams }: { milestone: Milestone; teams: Team[] }) {
  const { t } = useT();
  const [pairs, setPairs] = React.useState<SimilarPair[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const name = (id: string) => teams.find((tt) => tt.id === id)?.name ?? t("A team");

  async function run() {
    setBusy(true);
    try {
      setPairs(await getSimilarityHints(milestone.id));
    } catch (err) {
      console.error("Comparing hand-ins failed:", err);
      toast.error(t("Could not compare the hand-ins"));
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="similarity-title" className="rounded-2xl bg-muted/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="similarity-title" className="flex items-center gap-1.5 text-sm font-bold"><CopySimple weight="bold" className="size-4 text-primary" aria-hidden /> {t("Similarity check")}</h3>
        <Button size="sm" variant="outline" className="ml-auto" loading={busy} onClick={run}>{pairs ? t("Compare again") : t("Compare hand-ins")}</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("Compares notes, links and text files (code, Markdown, plain text) between teams. PDFs, documents and images aren't read. A match is a reason to look closer, not proof.")}</p>
      {pairs && (pairs.length === 0
        ? <p className="mt-2 text-sm font-semibold text-success" role="status">{t("No two hand-ins look alike.")}</p>
        : (
          <ul className="mt-2 space-y-1.5" aria-label={t("Similar hand-ins")}>
            {pairs.map((p) => (
              <li key={`${p.a}-${p.b}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-butter/70 px-3 py-2 text-sm">
                <WarningCircle weight="fill" className="size-4 shrink-0 text-warning" aria-hidden />
                <span className="font-semibold">{t("{a} and {b}", { a: name(p.a), b: name(p.b) })}</span>
                <span className="text-muted-foreground">
                  {[p.sameLink && t("the same link"), p.score >= 50 && t("{n}% of the text matches", { n: p.score })].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export function SubmissionsReview({ milestone, teams, open, onOpenChange, onChanged }: {
  milestone: Milestone; teams: Team[]; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void;
}) {
  const { t } = useT();
  const handedIn = milestone.submissions.length;
  const overdueFor = (teamId: string) => new Date() > new Date(`${dueFor(milestone, teamId)}T23:59:59.999`);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Hand-ins: {title}", { title: milestone.title })}</DialogTitle>
          <DialogDescription>{t("{n} of {total} teams handed in · due {date}. Marks go in Grading.", { n: handedIn, total: teams.length, date: new Date(`${milestone.dueDate}T00:00:00`).toLocaleDateString(intl(), { day: "numeric", month: "long" }) })}</DialogDescription>
        </DialogHeader>
        {handedIn >= 2 && <SimilarityCheck milestone={milestone} teams={teams} />}
        <ul className="space-y-3">
          {teams.map((tt) => {
            const sub = milestone.submissions.find((x) => x.teamId === tt.id);
            const overdue = overdueFor(tt.id);
            const extended = dueFor(milestone, tt.id) !== milestone.dueDate;
            return (
              <li key={tt.id} className="rounded-2xl border p-4" aria-label={tt.name}>
                <div className="flex items-center gap-2">
                  <Avatar name={tt.name} size="sm" />
                  <p className="min-w-0 flex-1 truncate font-bold">{tt.name}</p>
                  {extended && <span className="rounded-full bg-sky px-2 py-0.5 text-[0.6875rem] font-bold text-info">{t("Extended to {date}", { date: new Date(`${dueFor(milestone, tt.id)}T00:00:00`).toLocaleDateString(intl(), { day: "numeric", month: "short" }) })}</span>}
                  {!sub && <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", overdue ? "bg-rose text-destructive" : "bg-muted text-muted-foreground")}>{overdue ? t("Missing") : t("Not yet")}</span>}
                </div>
                {sub && (
                  <div className="mt-3 space-y-3">
                    <SubmissionSummary sub={sub} dueDate={dueFor(milestone, tt.id)} showFeedback={false} />
                    <FeedbackForm team={tt} milestone={milestone} sub={sub} onSaved={onChanged} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
