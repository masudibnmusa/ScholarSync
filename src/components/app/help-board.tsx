"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CaretDown, CheckCircle, Lifebuoy, PaperPlaneTilt, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { answerQuestion, askQuestion, deleteHelpPost, getHelpBoard, markSolution } from "@/app/actions";
import { cn, timeAgo } from "@/lib/utils";
import type { HelpQuestion } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";
import { useT } from "@/components/locale";

const SHOWN = 5;
type Deleting = { kind: "question" | "answer"; id: string } | null;

function Question({ q, open, onToggle, canModerate, readOnly, onChanged, onDelete }: {
  q: HelpQuestion; open: boolean; onToggle: () => void; canModerate: boolean; readOnly: boolean; onChanged: () => Promise<unknown>; onDelete: (d: Deleting) => void;
}) {
  const { t, tn } = useT();
  const me = useUser();
  const mine = q.authorId === me.id;
  const [answer, setAnswer] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy("answer");
    try {
      await answerQuestion(q.id, answer);
      setAnswer("");
      await onChanged();
    } catch (err) {
      console.error("Answering failed:", err);
      toast.error(t("Could not post your answer"));
    }
    setBusy(null);
  }

  async function solve(answerId: string | null) {
    setBusy(answerId ?? "unsolve");
    try {
      await markSolution(q.id, answerId);
      if (answerId) toast.success(t("Marked as the solution. Thanks for saying so."));
      await onChanged();
    } catch (err) {
      console.error("Marking the solution failed:", err);
      toast.error(t("Could not mark the solution"));
    }
    setBusy(null);
  }

  return (
    <li id={`help-${q.id}`} className="rounded-2xl border">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 rounded-2xl p-3.5 text-left transition-colors hover:bg-accent/50">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-bold">
            {q.title}
            {q.solvedBy && <Badge variant="success" className="gap-1"><CheckCircle weight="fill" aria-hidden />{t("Solved")}</Badge>}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {q.authorName} · <time dateTime={q.createdAt}>{timeAgo(q.createdAt)}</time> · {tn(q.answers.length, "{n} answer", "{n} answers")}
          </span>
        </span>
        <CaretDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 border-t px-3.5 pb-3.5 pt-3">
          {q.body && <p className="whitespace-pre-wrap break-words text-sm">{q.body}</p>}
          {q.answers.length > 0 && (
            <ul className="space-y-2" aria-label={t("Answers")}>
              {q.answers.map((a) => {
                const solution = q.solvedBy === a.id;
                return (
                  <li key={a.id} className={cn("rounded-xl p-3", solution ? "bg-sage" : "bg-muted/60")} aria-label={solution ? t("Solution from {name}", { name: a.authorName }) : t("Answer from {name}", { name: a.authorName })}>
                    <p className="whitespace-pre-wrap break-words text-sm">{a.body}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{a.authorName}</span>
                      {a.byInstructor && <Badge variant="muted">{t("Instructor")}</Badge>}
                      <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
                      {solution && <span className="inline-flex items-center gap-1 font-bold text-success"><CheckCircle weight="fill" className="size-3.5" aria-hidden />{t("Solved it")}</span>}
                      <span className="ml-auto flex items-center gap-1">
                        {mine && !readOnly && a.authorId !== me.id && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" loading={busy === a.id || (solution && busy === "unsolve")}
                            onClick={() => solve(solution ? null : a.id)}>{solution ? t("Unmark") : t("Mark as solution")}</Button>
                        )}
                        {(a.authorId === me.id || canModerate) && !readOnly && (
                          <button type="button" onClick={() => onDelete({ kind: "answer", id: a.id })} aria-label={t("Delete answer from {name}", { name: a.authorName })}
                            className="grid size-7 place-items-center rounded-lg hover:bg-accent hover:text-destructive"><Trash className="size-3.5" aria-hidden /></button>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && (
            <form onSubmit={send} className="flex items-end gap-2">
              <label htmlFor={`answer-${q.id}`} className="sr-only">{t("Your answer")}</label>
              <Textarea id={`answer-${q.id}`} value={answer} rows={2} maxLength={4000} placeholder={mine ? t("Add a detail or a follow-up…") : t("Share what worked for you…")}
                onChange={(e) => setAnswer(e.target.value)} className="min-h-0 flex-1" />
              <Button type="submit" size="sm" loading={busy === "answer"} disabled={!answer.trim()}>{busy !== "answer" && <PaperPlaneTilt aria-hidden />}{t("Answer")}</Button>
            </form>
          )}
          {(mine || canModerate) && !readOnly && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete({ kind: "question", id: q.id })}>
              <Trash aria-hidden /> {t("Delete question")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Peer help board on the course page: a student asks the course, anyone in it answers (the instructor too, and they
 * can remove posts), and the asker marks the answer that solved it. Solved answers count in the contribution report.
 */
export function HelpBoard({ courseId, instructor, readOnly }: { courseId: string; instructor: boolean; readOnly: boolean }) {
  const { t } = useT();
  const params = useSearchParams();
  const linked = params.get("help"); // from a notification: open that question
  const [items, setItems] = React.useState<HelpQuestion[] | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(linked);
  const [all, setAll] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", body: "" });
  const [posting, setPosting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Deleting>(null);

  const load = React.useCallback(() => getHelpBoard(courseId).then(setItems).catch((err) => {
    console.error("Loading the help board failed:", err);
    setItems((x) => x ?? []);
  }), [courseId]);
  const live = useLive("help_questions", "help_answers");
  React.useEffect(() => { load(); }, [load, live]);
  React.useEffect(() => {
    if (linked && items?.some((q) => q.id === linked)) document.getElementById(`help-${linked}`)?.scrollIntoView({ block: "center" });
  }, [linked, items]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setPosting(true);
    try {
      await askQuestion(courseId, form);
      setForm({ title: "", body: "" });
      toast.success(t("Question posted. Everyone in the course can answer."));
      await load();
    } catch (err) {
      console.error("Asking failed:", err);
      toast.error(t("Could not post your question"));
    }
    setPosting(false);
  }

  async function remove() {
    if (!deleting) return;
    try {
      await deleteHelpPost(deleting.kind, deleting.id);
      await load();
    } catch (err) {
      console.error("Deleting the post failed:", err);
      toast.error(t("Could not delete it"));
    }
  }

  const linkedIndex = items?.findIndex((q) => q.id === linked) ?? -1;
  const shown = all || linkedIndex >= SHOWN ? items : items?.slice(0, SHOWN);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-sky text-info"><Lifebuoy weight="fill" className="size-4" aria-hidden /></span>
        {t("Help board")}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("Stuck? Ask the whole course. Answers that solve a question count in your contribution report.")}</p>

      {!instructor && !readOnly && (
        <form onSubmit={ask} className="mb-4 space-y-2 rounded-2xl bg-muted/50 p-3">
          <label htmlFor="help-title" className="sr-only">{t("Your question")}</label>
          <Input id="help-title" value={form.title} maxLength={160} placeholder={t("Your question, e.g. How do I connect to the database?")} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label htmlFor="help-body" className="sr-only">{t("Details")}</label>
          <Textarea id="help-body" value={form.body} maxLength={4000} rows={2} placeholder={t("What you tried, and what happened (optional)")} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={posting} disabled={!form.title.trim()}>{!posting && <PaperPlaneTilt aria-hidden />}{t("Ask")}</Button>
          </div>
        </form>
      )}

      {!shown ? (
        <Skeleton className="h-16" />
      ) : !shown.length ? (
        <p className="text-sm text-muted-foreground">{t("No questions yet.")}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((q) => (
            <Question key={q.id} q={q} open={openId === q.id} onToggle={() => setOpenId(openId === q.id ? null : q.id)}
              canModerate={instructor} readOnly={readOnly} onChanged={load} onDelete={setDeleting} />
          ))}
        </ul>
      )}
      {items && items.length > SHOWN && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAll(!all)}>{all ? t("Show fewer") : t("Show all {count}", { count: items.length })}</Button>
      )}

      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting?.kind === "question" ? t("Delete this question?") : t("Delete this answer?")}
        description={deleting?.kind === "question" ? t("Its answers go with it. This can't be undone.") : t("This can't be undone.")} onConfirm={remove} />
    </Card>
  );
}
