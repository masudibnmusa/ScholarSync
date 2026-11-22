"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowClockwise, CheckCircle, HandWaving, Sparkle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { getStandup, refreshStandupSummary, saveStandup } from "@/app/actions";
import { useLive } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { StandupAnswer, Team, TeamStandup } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { weekLabel } from "@/components/student/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { t, msg } from "@/lib/i18n";

const QUESTIONS = [
  { key: "done", label: msg("Done since last week"), placeholder: msg("e.g. Finished the login page and its tests") },
  { key: "next", label: msg("Next up"), placeholder: msg("e.g. Start on the database schema") },
  { key: "blocked", label: msg("Blocked by"), placeholder: msg("Nothing, or what's in your way") },
] as const;
type Answers = Record<(typeof QUESTIONS)[number]["key"], string>;

// "nothing", "none", "no" and the like are not blockers.
const isBlocked = (text: string) => !!text.trim() && !/^(no|none|nothing|nope|n\/?a|-|all good)\.?$/i.test(text.trim());

/**
 * The weekly stand-up for one team. Students answer done / next / blocked (and see their teammates' answers);
 * the instructor reads the answers and the AI summary. `?standup=1` opens it, as the Monday notification does.
 */
export function StandupButton({ team }: { team: Team }) {
  const { t } = useT();
  const user = useUser();
  const instructor = user.role === "instructor";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromLink = params.get("standup") === "1";
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<TeamStandup | undefined>(undefined);
  const live = useLive("standups", "standup_summaries", "team_members");
  const isOpen = open || fromLink;

  const load = React.useCallback(() => getStandup(team.id).then(setData).catch((err) => console.error("Loading the stand-up failed:", err)), [team.id]);
  React.useEffect(() => { load(); }, [load, live]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && fromLink) {
      const rest = new URLSearchParams(params.toString());
      rest.delete("standup");
      router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    }
  }

  const mine = data?.answers.find((a) => a.userId === user.id);
  const others = data?.answers.filter((a) => a.userId !== user.id) ?? [];
  const waiting = data?.members.filter((m) => !data.answers.some((a) => a.userId === m.userId)) ?? [];
  const owesAnswer = !instructor && !!data && !mine && !team.courseArchived;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={owesAnswer ? t("Weekly stand-up (not answered yet)") : t("Weekly stand-up")} className="relative">
          <HandWaving weight="duotone" aria-hidden />
          <span className="hidden xl:inline">{t("Stand-up")}</span>
          {owesAnswer && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-peach text-primary"><HandWaving weight="fill" className="size-4" aria-hidden /></span>
            {team.name}{t("'s stand-up")}
          </DialogTitle>
          <DialogDescription>
            {data ? t("Week of {week} · ", { week: weekLabel(data.weekStart) }) : ""}
            {instructor ? t("Each student's answers, and an AI summary once they come in.") : t("Three quick answers. Your team and instructor see them.")}
          </DialogDescription>
        </DialogHeader>

        {data === undefined ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-16" /></div>
        ) : (
          <div className="space-y-5">
            {instructor ? <SummaryPanel team={team} data={data} onDone={load} /> : (
              <MyAnswers key={mine?.updatedAt ?? "new"} team={team} mine={mine} onSaved={load} />
            )}
            <section aria-labelledby="standup-team">
              <h3 id="standup-team" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {instructor ? t("Answers ({n} of {total})", { n: data.answers.length, total: data.members.length }) : t("Teammates ({n} of {total})", { n: others.length, total: data.members.length - 1 })}
              </h3>
              <ul className="space-y-2">
                {(instructor ? data.answers : others).map((a) => <AnswerCard key={a.userId} a={a} />)}
              </ul>
              {waiting.filter((m) => instructor || m.userId !== user.id).length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Waiting on")} {waiting.filter((m) => instructor || m.userId !== user.id).map((m) => m.name).join(", ")}.
                </p>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MyAnswers({ team, mine, onSaved }: { team: Team; mine?: StandupAnswer; onSaved: () => void }) {
  const { t } = useT();
  const [form, setForm] = React.useState<Answers>({ done: mine?.done ?? "", next: mine?.next ?? "", blocked: mine?.blocked ?? "" });
  const [saving, setSaving] = React.useState(false);
  const empty = !form.done.trim() && !form.next.trim() && !form.blocked.trim();
  const changed = !mine || QUESTIONS.some((q) => form[q.key].trim() !== mine[q.key]);
  const readOnly = team.courseArchived;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveStandup(team.id, form);
      toast.success(mine ? t("Stand-up updated") : t("Stand-up sent"), { description: t("Your team and instructor can see it.") });
      onSaved();
    } catch (err) {
      console.error("Saving the stand-up failed:", err);
      toast.error(t("Could not save your stand-up"));
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save} className="space-y-3" aria-label={t("Your stand-up")}>
      {QUESTIONS.map((q) => (
        <Field key={q.key} label={t(q.label)} htmlFor={`standup-${q.key}`} optional={q.key === "blocked"}>
          <Textarea id={`standup-${q.key}`} rows={2} maxLength={1000} value={form[q.key]} placeholder={t(q.placeholder)} disabled={readOnly}
            onChange={(e) => setForm({ ...form, [q.key]: e.target.value })} />
        </Field>
      ))}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{readOnly ? t("This course is archived.") : mine ? t("Sent {when}", { when: timeAgo(mine.updatedAt) }) : t("Not sent yet")}</p>
        {!readOnly && <Button type="submit" loading={saving} disabled={empty || !changed}>{!saving && <CheckCircle aria-hidden />}{mine ? t("Update") : t("Send")}</Button>}
      </div>
    </form>
  );
}

function SummaryPanel({ team, data, onDone }: { team: Team; data: TeamStandup; onDone: () => void }) {
  const { t, tn } = useT();
  const [busy, setBusy] = React.useState(false);
  const s = data.summary;
  const stale = s && s.answered < data.answers.length;

  async function summarise() {
    setBusy(true);
    try {
      const r = await refreshStandupSummary(team.id);
      if (r === "empty") toast.info(t("Nobody has answered yet."));
      else if (r === "cooldown") toast.info(t("The summary was written a minute ago."));
      onDone();
    } catch (err) {
      console.error("Summarising the stand-up failed:", err);
      toast.error(t("Could not write the summary. The AI may be busy; try again in a minute."));
    }
    setBusy(false);
  }

  return (
    <section aria-label={t("AI summary")} className="space-y-3">
      {s ? (
        <>
          <p className="rounded-2xl bg-sky/60 px-4 py-3 text-[0.9375rem] leading-relaxed">{s.summary}</p>
          {s.blockers.length > 0 && (
            <ul className="space-y-1.5" aria-label={t("Blockers")}>
              {s.blockers.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm"><WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{b}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {data.answers.length ? t("The AI summary arrives a few minutes after the answers settle.") : t("No answers yet this week. Students are asked every Monday.")}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{s ? tn(s.answered, "Written by AI {when} from {n} answer", "Written by AI {when} from {n} answers", { when: timeAgo(s.generatedAt) }) + (stale ? t("; newer answers since") : "") : ""}</p>
        <Button variant="secondary" size="sm" onClick={summarise} loading={busy} disabled={!data.answers.length}>
          {!busy && (s ? <ArrowClockwise aria-hidden /> : <Sparkle aria-hidden />)} {s ? t("Refresh summary") : t("Summarise now")}
        </Button>
      </div>
    </section>
  );
}

function AnswerCard({ a }: { a: StandupAnswer }) {
  const { t } = useT();
  return (
    <li className="rounded-2xl border bg-card p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar id={a.userId} name={a.name} size="xs" />
        <span className="text-sm font-bold">{a.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{timeAgo(a.updatedAt)}</span>
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-sm">
        {QUESTIONS.map((q) => a[q.key] && (
          <React.Fragment key={q.key}>
            <dt className="text-xs font-semibold text-muted-foreground">{q.key === "done" ? t("Done") : q.key === "next" ? t("Next") : t("Blocked")}</dt>
            <dd className={cn("whitespace-pre-wrap", q.key === "blocked" && isBlocked(a.blocked) && "font-semibold text-warning")}>{a[q.key]}</dd>
          </React.Fragment>
        ))}
      </dl>
    </li>
  );
}
