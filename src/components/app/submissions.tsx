"use client";

import * as React from "react";
import { ChatCircleText, CheckCircle, Clock, DownloadSimple, LinkSimple, Paperclip, UploadSimple, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { saveSubmissionFeedback, submitWork } from "@/app/actions";
import { MAX_FILE_BYTES, useAppStore } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Milestone, Submission, Team } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";

/** Late = handed in after the end of the due day, in the viewer's time zone (like every due date in the app). */
export function isLate(submittedAt: string, dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(submittedAt) > new Date(y, m - 1, d, 23, 59, 59, 999);
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const size = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

export function TimingBadge({ sub, dueDate }: { sub: Submission; dueDate: string }) {
  const late = isLate(sub.submittedAt, dueDate);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", late ? "bg-butter text-warning" : "bg-sage text-success")}>
      {late ? <Clock weight="bold" className="size-3" aria-hidden /> : <CheckCircle weight="fill" className="size-3" aria-hidden />}
      {late ? "Late" : "On time"}
    </span>
  );
}

/** What was handed in: the file (download), the link, the note, and the instructor's feedback. */
export function SubmissionSummary({ sub, dueDate, showFeedback = true }: { sub: Submission; dueDate: string; showFeedback?: boolean }) {
  const download = useAppStore((s) => s.downloadFile);
  const stale = sub.feedbackAt && new Date(sub.feedbackAt) < new Date(sub.submittedAt);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <TimingBadge sub={sub} dueDate={dueDate} />
        <span>Handed in {when(sub.submittedAt)} by {sub.submittedByName}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {sub.storagePath && sub.fileName && (
          <button type="button" onClick={() => download(sub.storagePath!)}
            className="inline-flex max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary">
            <Paperclip className="size-4 shrink-0" aria-hidden /><span className="truncate">{sub.fileName}</span>
            {sub.fileSize != null && <span className="shrink-0 text-xs font-medium text-muted-foreground">{size(sub.fileSize)}</span>}
            <DownloadSimple className="size-4 shrink-0" aria-hidden /><span className="sr-only">Download</span>
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
          <p className="flex items-center gap-1.5 text-xs font-bold text-info"><ChatCircleText weight="fill" className="size-4" aria-hidden />Instructor feedback{stale && <span className="font-medium text-muted-foreground"> · on an earlier version</span>}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{sub.feedback}</p>
        </div>
      )}
    </div>
  );
}

/** Student: hand in a file and/or a link with a note. Handing in again replaces the earlier version. */
export function HandInDialog({ team, milestone, current, open, onOpenChange, onDone }: {
  team: Team; milestone: Milestone; current: Submission | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [keepFile, setKeepFile] = React.useState(!!current?.storagePath);
  const [link, setLink] = React.useState(current?.link ?? "");
  const [note, setNote] = React.useState(current?.note ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const late = new Date() > new Date(`${milestone.dueDate}T23:59:59.999`);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setError(`${f.name} is over 50 MB.`);
    setFile(f);
    setKeepFile(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) return setError("Use a web link starting with http:// or https://");
    if (!file && !keepFile && !url) return setError("Attach a file or add a link.");
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
      toast.success(current ? "New version handed in" : "Handed in", { description: late ? "It's after the due date, so it's marked late." : "Your instructor was notified." });
      onDone();
      onOpenChange(false);
    } catch (err) {
      console.error("Hand-in failed:", err);
      if (uploaded) await bucket.remove([uploaded]); // don't leave an orphaned file behind
      setError(err instanceof Error && /archived/i.test(err.message) ? "This course is archived, so nothing can be handed in." : "Could not hand in. Please try again.");
    }
    setSaving(false);
  }

  const shownFile = file ? { name: file.name, size: file.size } : keepFile && current?.fileName ? { name: current.fileName, size: current.fileSize ?? 0 } : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current ? "Hand in a new version" : "Hand in"}: {milestone.title}</DialogTitle>
          <DialogDescription>
            {team.name} · due {new Date(`${milestone.dueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" })}
            {current ? ". This replaces your earlier hand-in." : "."}
          </DialogDescription>
        </DialogHeader>
        {late && (
          <p className="flex items-start gap-2 rounded-xl bg-butter/70 px-3 py-2 text-sm text-warning">
            <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />The due date has passed. You can still hand in, but it will be marked late.
          </p>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="File" htmlFor="handin-file" optional hint="Any file up to 50 MB: a report, slides, a zip of your code…">
            <input ref={input} id="handin-file" type="file" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {shownFile ? (
              <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{shownFile.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{size(shownFile.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${shownFile.name}`} onClick={() => { setFile(null); setKeepFile(false); }}><X aria-hidden /></Button>
              </div>
            ) : (
              <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                <UploadSimple className="size-5" aria-hidden /><span className="font-semibold">Choose a file</span><span className="text-xs">or drop it here</span>
              </button>
            )}
          </Field>
          <Field label="Link" htmlFor="handin-link" optional hint="A repository, a shared document or a demo video.">
            <Input id="handin-link" type="url" inputMode="url" value={link} onChange={(e) => { setLink(e.target.value); setError(null); }} placeholder="https://github.com/your-team/project" maxLength={2000} />
          </Field>
          <Field label="Note to your instructor" htmlFor="handin-note" optional error={error}>
            <Textarea id="handin-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="Anything they should know: what's done, what's missing…" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{!saving && <UploadSimple aria-hidden />} {current ? "Hand in new version" : "Hand in"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ team, milestone, sub, onSaved }: { team: Team; milestone: Milestone; sub: Submission; onSaved: () => void }) {
  const [text, setText] = React.useState(sub.feedback);
  const [saving, setSaving] = React.useState(false);
  const id = `feedback-${team.id}`;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSubmissionFeedback(team.id, milestone.id, text);
      toast.success(`Feedback saved for ${team.name}`, { description: text.trim() ? "The team was notified." : undefined });
      onSaved();
    } catch (err) {
      console.error("Saving feedback failed:", err);
      toast.error("Could not save the feedback");
    }
    setSaving(false);
  }
  return (
    <form onSubmit={save} className="space-y-2">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">Feedback to {team.name}</label>
      <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3} placeholder="What works, what to improve…" />
      <div className="flex items-center justify-end gap-2">
        {sub.feedbackAt && new Date(sub.feedbackAt) < new Date(sub.submittedAt) && <span className="mr-auto text-xs text-warm-text">They handed in a new version since your feedback.</span>}
        <Button type="submit" size="sm" loading={saving} disabled={text.trim() === sub.feedback.trim()}>Save feedback</Button>
      </div>
    </form>
  );
}

/** Instructor: every team's hand-in for one milestone, with feedback. */
export function SubmissionsReview({ milestone, teams, open, onOpenChange, onChanged }: {
  milestone: Milestone; teams: Team[]; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void;
}) {
  const handedIn = milestone.submissions.length;
  const overdue = new Date() > new Date(`${milestone.dueDate}T23:59:59.999`);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Hand-ins: {milestone.title}</DialogTitle>
          <DialogDescription>{handedIn} of {teams.length} teams handed in · due {new Date(`${milestone.dueDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}. Marks go in Grading.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {teams.map((t) => {
            const sub = milestone.submissions.find((x) => x.teamId === t.id);
            return (
              <li key={t.id} className="rounded-2xl border p-4" aria-label={t.name}>
                <div className="flex items-center gap-2">
                  <Avatar name={t.name} size="sm" />
                  <p className="min-w-0 flex-1 truncate font-bold">{t.name}</p>
                  {!sub && <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", overdue ? "bg-rose text-destructive" : "bg-muted text-muted-foreground")}>{overdue ? "Missing" : "Not yet"}</span>}
                </div>
                {sub && (
                  <div className="mt-3 space-y-3">
                    <SubmissionSummary sub={sub} dueDate={milestone.dueDate} showFeedback={false} />
                    <FeedbackForm team={t} milestone={milestone} sub={sub} onSaved={onChanged} />
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
