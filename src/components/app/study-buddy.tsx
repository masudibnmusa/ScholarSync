"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Flag, Megaphone, PaperPlaneTilt, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { askStudyBuddy, type StudyAnswer } from "@/app/actions";
import type { SourceKind } from "@/lib/study-buddy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/locale";

const KIND_ICON = { announcement: Megaphone, milestone: Flag, file: FileText } satisfies Record<SourceKind, unknown>;
type Turn = { question: string; reply: StudyAnswer | null; failed?: boolean };

/** The answer text with its [1] markers as links to the numbered sources below it. */
function Answer({ id, reply }: { id: string; reply: StudyAnswer }) {
  const { t } = useT();
  const parts = reply.answer.split(/(\[\d+\])/);
  return (
    <>
      <p className="whitespace-pre-line text-sm">
        {parts.map((p, i) => {
          const n = /^\[(\d+)\]$/.exec(p)?.[1];
          return n
            ? <a key={i} href={`#${id}-src-${n}`} className="mx-0.5 align-super text-[0.6875rem] font-bold text-primary hover:underline" aria-label={t("source {n}", { n })}>{n}</a>
            : <React.Fragment key={i}>{p}</React.Fragment>;
        })}
      </p>
      {reply.cited.length > 0 && (
        <ol className="mt-2 space-y-1" aria-label={t("Sources")}>
          {reply.cited.map((c) => {
            const Icon = KIND_ICON[c.kind];
            return (
              <li key={c.n} id={`${id}-src-${c.n}`} className="flex items-center gap-2 text-xs">
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-primary/10 font-bold text-primary">{c.n}</span>
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <Link href={c.link} className="min-w-0 truncate font-semibold hover:text-primary hover:underline">{c.title}</Link>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/**
 * Ask the course a question and get an AI answer drawn only from its announcements, milestones and (students) the team's
 * files, with the sources it used. Nothing is saved: the conversation lives on this page.
 */
export function StudyBuddy({ courseId }: { courseId: string }) {
  const { t } = useT();
  const [question, setQuestion] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const busy = turns.some((x) => !x.reply && !x.failed);
  const base = React.useId();

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setQuestion("");
    setTurns((list) => [{ question: q, reply: null }, ...list].slice(0, 5));
    try {
      const reply = await askStudyBuddy(courseId, q);
      setTurns((list) => list.map((x) => (x.question === q && !x.reply ? { ...x, reply } : x)));
    } catch (err) {
      console.error("The study buddy failed:", err);
      setTurns((list) => list.map((x) => (x.question === q && !x.reply ? { ...x, failed: true } : x)));
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-peach text-warm-text"><Sparkle weight="fill" className="size-4" aria-hidden /></span>
        {t("Study buddy")}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("Ask about this course. Answers come only from its announcements, milestones and your team's files, with the sources. AI can be wrong, so check them.")}</p>
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="study-question" className="sr-only">{t("Ask about this course")}</label>
        <Input id="study-question" value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} placeholder={t("e.g. When is the report due, and what goes in it?")} className="flex-1" />
        <Button type="submit" loading={busy} disabled={question.trim().length < 3} aria-label={t("Ask the study buddy")}>{!busy && <PaperPlaneTilt aria-hidden />}{t("Ask")}</Button>
      </form>
      {turns.length > 0 && (
        <ul className="mt-4 space-y-3" aria-label={t("Study buddy answers")} aria-live="polite">
          {turns.map((x, i) => (
            <li key={turns.length - i} className="rounded-2xl border p-3.5">
              <p className="text-sm font-bold">{x.question}</p>
              <div className="mt-2">
                {x.reply ? <Answer id={`${base}-${turns.length - i}`} reply={x.reply} />
                  : x.failed ? <p className="text-sm text-destructive">{t("The study buddy couldn't answer just now. Try again in a moment.")}</p>
                  : <p className="text-sm text-muted-foreground" role="status">{t("Reading the course…")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
