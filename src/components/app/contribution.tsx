"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChatsCircle, CheckSquare, FilePdf, FileText, GitCommit, HandHeart, HandWaving, Lifebuoy, Quotes, Star, Timer, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { getContribution } from "@/app/actions";
import { useLive } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { Contribution } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { EmptyState, Page, StatCard } from "@/components/app/page";
import { GroupedBars, Legend } from "@/components/instructor/charts";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { translateReason } from "@/lib/i18n/notices";
import { intl, num } from "@/lib/i18n";

type Team = NonNullable<Contribution["team"]>;
const COLS: Record<number, string> = { 4: "lg:grid-cols-4 print:grid-cols-4", 5: "lg:grid-cols-5 print:grid-cols-5", 6: "lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-6", 7: "lg:grid-cols-4 2xl:grid-cols-7 print:grid-cols-4" };
const share = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(intl(), { month: "short", day: "numeric" });

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6" aria-labelledby={id} role="region">
      <h2 id={id} className="text-lg font-extrabold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const WEEK_SERIES = [
  { key: "tasks", name: "Tasks done", color: "var(--chart-1)" },
  { key: "messages", name: "Messages", color: "var(--chart-3)" },
] as const;

/** Two columns per week (tasks, messages), scaled to the busiest week. */
function WeekColumns({ weeks }: { weeks: Team["weeks"] }) {
  const { t } = useT();
  const top = Math.max(1, ...weeks.flatMap((w) => [w.tasks, w.messages]));
  return (
    <figure aria-label={t("Weekly activity")}>
      <div className="flex h-40 items-end gap-1.5 border-b border-border/70 sm:gap-3">
        {weeks.map((w) => (
          <div key={w.week} role="img" aria-label={t("Week of {date}: {tasks} tasks done, {messages} messages", { date: shortDay(w.week), tasks: w.tasks, messages: w.messages })}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 sm:gap-1">
            {WEEK_SERIES.map((s) => (
              <span key={s.key} className="relative flex h-full max-w-4 flex-1 items-end">
                <span className="w-full rounded-t-md transition-[height] duration-700" style={{ height: `${(w[s.key] / top) * 100}%`, minHeight: w[s.key] ? 4 : 2, backgroundColor: s.color, opacity: w[s.key] ? 1 : 0.25 }} />
                {w[s.key] > 0 && <span className="absolute inset-x-0 -translate-y-full text-center text-[0.625rem] font-bold tabular-nums text-muted-foreground" style={{ bottom: `${(w[s.key] / top) * 100}%` }} aria-hidden>{num(w[s.key])}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-3" aria-hidden>
        {weeks.map((w, i) => <span key={w.week} className={cn("min-w-0 flex-1 truncate text-center text-[0.6875rem] text-muted-foreground", i % 2 === 1 && "hidden sm:block")}>{shortDay(w.week)}</span>)}
      </div>
      <figcaption className="mt-3"><Legend series={[...WEEK_SERIES]} /></figcaption>
    </figure>
  );
}

function TaskList({ tasks }: { tasks: Team["tasks"] }) {
  const { t } = useT();
  if (!tasks.length) return <p className="text-sm text-muted-foreground">{t("No tasks assigned yet.")}</p>;
  return (
    <ul className="divide-y" aria-label={t("Assigned tasks")}>
      {tasks.map((tt) => {
        const late = tt.dueDate && (tt.doneAt ? tt.doneAt.slice(0, 10) > tt.dueDate : tt.dueDate < new Date().toISOString().slice(0, 10));
        return (
          <li key={tt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tt.title}</span>
            <span className="text-xs text-muted-foreground">
              {tt.status === "done" ? (tt.doneAt ? t("Done {when}", { when: timeAgo(tt.doneAt) }) : t("Done")) : tt.dueDate ? t("Due {date}", { date: shortDay(tt.dueDate) }) : t("No due date")}
            </span>
            {tt.status === "done"
              ? <Badge variant={late ? "warning" : "success"}>{late ? t("Done late") : t("Done")}</Badge>
              : <Badge variant={late ? "danger" : "muted"}>{late ? t("Overdue") : tt.status === "in-progress" ? t("In progress") : t("To do")}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

function PeerReviews({ peer }: { peer: NonNullable<Team["peer"]> }) {
  const { t, tn } = useT();
  if (!peer.n) return <p className="text-sm text-muted-foreground">{t("No teammate has reviewed this student yet.")}</p>;
  return (
    <div className="space-y-4">
      <p className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold">{num(peer.avg)}</span>
        <span className="text-sm text-muted-foreground">{tn(peer.n, "of 5, from {n} review", "of 5, from {n} reviews")}</span>
      </p>
      {Object.keys(peer.categories).length > 0 && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries(peer.categories).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <dt className="w-32 shrink-0 truncate text-sm capitalize">{k}</dt>
              <dd className="flex flex-1 items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-butter-strong" style={{ width: `${(v / 5) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-sm font-bold tabular-nums">{num(v)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {peer.feedback.length > 0 && (
        <ul className="space-y-2" aria-label={t("Written feedback")}>
          {peer.feedback.map((f, i) => (
            <li key={i} className="flex gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm">
              <Quotes weight="fill" className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{f.text}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(f.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One student's contribution in one course, next to their team's: what the instructor looks at when grading, and what
 * the student can check about themselves. Peer reviews and at-risk signals are shown to the instructor only.
 */
export function ContributionReport({ courseId, userId }: { courseId: string; userId?: string }) {
  const { locale, t, tn } = useT();
  const me = useUser();
  const instructor = me.role === "instructor";
  const id = userId ?? me.id;
  const [data, setData] = React.useState<Contribution | null | undefined>(undefined);
  const live = useLive("tasks", "files", "standups", "peer_reviews", "team_members", "falling_behind");
  React.useEffect(() => {
    getContribution(courseId, id).then(setData).catch((err) => { console.error("Loading the contribution report failed:", err); setData(null); });
  }, [courseId, id, live]);

  const back = `/${me.role}/courses/${courseId}`;
  const backLink = (
    <Link href={back} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold print:hidden text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {data?.course.code ?? t("Course")}
    </Link>
  );

  if (data === undefined) return <Page><Skeleton className="h-6 w-24" /><Skeleton className="h-20" /><div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div></Page>;
  if (data === null) {
    return (
      <Page>
        <Card><EmptyState icon={UsersThree} title={t("Report not available")} description={t("Only the student and the course instructor can see a contribution report.")}>
          <Button asChild><Link href={back}>{t("Back to the course")}</Link></Button>
        </EmptyState></Card>
      </Page>
    );
  }

  const self = data.student.id === me.id;
  const team = data.team;
  const mine = team?.members.find((m) => m.userId === data.student.id);
  const totals = team && {
    done: sum(team.members.map((m) => m.tasksDone)),
    messages: sum(team.members.map((m) => m.messages)),
    files: sum(team.members.map((m) => m.files)),
    commits: sum(team.members.map((m) => m.commits)),
  };

  return (
    <Page>
      {backLink}
      <header className="flex flex-wrap items-center gap-4">
        <Avatar id={data.student.id} name={data.student.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold sm:text-[2rem]"><span className="highlight">{self ? t("Your contribution") : data.student.name}</span></h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-[0.9375rem]">
            {team ? `${team.name} · ${data.course.code} ${data.course.title}` : `${data.course.code} ${data.course.title}`}
            {self && <span className="print:hidden">{t(" · what your instructor sees when grading. Peer reviews stay private.")}</span>}
          </p>
          <p className="mt-1 hidden text-xs text-muted-foreground print:block">
            {t("Contribution report for {name} · made on {date} · ScholarSync", { name: data.student.name, date: new Date().toLocaleDateString(intl(), { day: "numeric", month: "long", year: "numeric" }) })}
          </p>
        </div>
        {team && (
          // The browser's print dialog saves it as a PDF; the print styles leave out the app around the report.
          <Button variant="outline" onClick={() => window.print()} className="print:hidden"><FilePdf aria-hidden /> {t("Save as PDF")}</Button>
        )}
        {team?.atRisk && <Badge variant="danger" className="gap-1"><Lifebuoy weight="fill" aria-hidden /> {t("At risk: {names}", { names: team.atRisk.map((r) => translateReason(locale, r)).join(", ") })}</Badge>}
      </header>

      {!team || !mine || !totals ? (
        <Card><EmptyState icon={UsersThree} title={t("Not on a team yet")} description={self ? t("Once you're placed in a team, your work shows up here.") : t("This student isn't on a team in this course yet.")} /></Card>
      ) : (
        <>
          <div className={cn("grid gap-4 sm:grid-cols-2", COLS[4 + (team.repo ? 1 : 0) + (data.helped.answers ? 1 : 0) + (data.focusMinutes ? 1 : 0)])}>
            <StatCard compact icon={CheckSquare} tone="success" label={t("Tasks done")} value={mine.tasksDone}
              hint={t("{tasksDone}% of the team's · {tasksAssigned} assigned", { tasksDone: share(mine.tasksDone, totals.done), tasksAssigned: mine.tasksAssigned })} />
            <StatCard compact icon={ChatsCircle} tone="info" label={t("Messages")} value={mine.messages} hint={t("{messages}% of team chat", { messages: share(mine.messages, totals.messages) })} />
            <StatCard compact icon={FileText} tone="primary" label={t("Files shared")} value={mine.files} hint={t("{files}% of the team's files", { files: share(mine.files, totals.files) })} />
            <StatCard compact icon={HandWaving} tone="warm" label={t("Stand-ups answered")} value={mine.standups}
              hint={team.standupWeeks ? tn(team.standupWeeks, "of {n} week the team did one", "of {n} weeks the team did one") : t("None yet")} />
            {team.repo && (
              <StatCard compact icon={GitCommit} tone="danger" label={t("Commits")} value={mine.commits}
                hint={mine.githubLogin ? t("{n}% of {repo}", { n: share(mine.commits, totals.commits), repo: team.repo }) : self ? t("Add your GitHub username in your profile") : t("No GitHub username in their profile")} />
            )}
            {data.helped.answers > 0 && (
              <StatCard compact icon={HandHeart} tone="info" label={t("Help board answers")} value={data.helped.answers}
                hint={tn(data.helped.solved, "{n} solved a classmate's question", "{n} solved classmates' questions")} />
            )}
            {data.focusMinutes > 0 && (
              <StatCard compact icon={Timer} tone="primary" label={t("Focus time")} value={data.focusMinutes} suffix={t(" min")} hint={t("on the focus timer, on team tasks")} />
            )}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2 print:grid-cols-2">
            <Section id="contrib-team" title={t("Compared with the team")} description={(team.repo ? t("Each member's share of the team's done tasks, messages, files and commits.") : t("Each member's share of the team's done tasks, messages and files."))}>
              <GroupedBars label={t("Share of team work by member")} max={100} suffix="%"
                series={[{ name: "Tasks done", color: "var(--chart-1)" }, { name: "Messages", color: "var(--chart-3)" }, { name: "Files", color: "var(--chart-4)" },
                  ...(team.repo ? [{ name: "Commits", color: "var(--chart-2)" }] : [])]}
                rows={team.members.map((m) => ({
                  id: m.userId,
                  label: m.userId === data.student.id && self ? t("You") : m.name,
                  values: [share(m.tasksDone, totals.done), share(m.messages, totals.messages), share(m.files, totals.files), ...(team.repo ? [share(m.commits, totals.commits)] : [])],
                }))} />
            </Section>
            <Section id="contrib-weeks" title={t("Last 8 weeks")} description={t("Tasks finished and messages sent each week.")}>
              <WeekColumns weeks={team.weeks} />
            </Section>
          </div>

          <div className={cn("grid items-start gap-6", team.peer && "lg:grid-cols-2")}>
            <Section id="contrib-tasks" title={t("Assigned tasks")} description={t("Most recently changed first.")}>
              <TaskList tasks={team.tasks} />
            </Section>
            {team.peer && (
              <Section id="contrib-peer" title={t("Peer reviews")} description={t("Visible to you only. Students never see who wrote what.")}>
                <PeerReviews peer={team.peer} />
              </Section>
            )}
          </div>
          {instructor && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Star weight="fill" className="size-3.5 text-butter-strong" aria-hidden />
              {t("Use this with the peer-review factor when grading the team in the course's Grading card.")}
            </p>
          )}
        </>
      )}
    </Page>
  );
}
