"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bell, ChartBar, ChatsCircle, CheckCircle, Clock, HandHeart, Lifebuoy, Info } from "@phosphor-icons/react/dist/ssr";
import { getAtRisk } from "@/app/actions";
import { useLive } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import type { AtRiskStudent } from "@/lib/types";
import { EmptyState, Page, PageHeader, StatCard } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DAY = 86_400_000;

/** Where the episode stands: nudged and waiting, or escalated to the instructor. */
function stage(s: AtRiskStudent) {
  if (s.resolvedAt) return `Recovered ${timeAgo(s.resolvedAt)}`;
  if (s.escalatedAt) return `Still behind 3 days after the nudge · you were told ${timeAgo(s.escalatedAt)}`;
  const left = Math.ceil((new Date(s.flaggedAt).getTime() + 3 * DAY - Date.now()) / DAY);
  return left > 0 ? `You'll be told in ${left} day${left === 1 ? "" : "s"} if it still holds` : "You'll be told at the next daily check if it still holds";
}

function StudentCard({ s }: { s: AtRiskStudent }) {
  return (
    <li>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <Avatar id={s.userId} name={s.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-extrabold">{s.name}</h3>
            <span className="text-sm text-muted-foreground">{s.teamName} · {s.courseCode}</span>
            {s.resolvedAt ? <Badge variant="success">Recovered</Badge> : s.escalatedAt ? <Badge variant="danger">Needs you</Badge> : <Badge variant="warning">Nudged</Badge>}
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Signals">
            {s.reasons.map((r) => <li key={r} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{r}</li>)}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />Private nudge {timeAgo(s.flaggedAt)}</span>
            <span>{stage(s)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm"><Link href={`/instructor/courses/${s.courseId}/students/${s.userId}`}><ChartBar aria-hidden /> Contribution</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href={`/instructor?team=${s.teamId}&view=chat`}><ChatsCircle aria-hidden /> Message team</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/instructor?team=${s.teamId}`}>Open team <ArrowRight aria-hidden /></Link></Button>
        </div>
      </Card>
    </li>
  );
}

export function AtRiskPanel() {
  const [rows, setRows] = React.useState<AtRiskStudent[] | undefined>(undefined);
  const live = useLive("falling_behind");
  React.useEffect(() => {
    getAtRisk().then(setRows).catch((err) => { console.error("Loading at-risk students failed:", err); setRows([]); });
  }, [live]);

  const open = (rows ?? []).filter((r) => !r.resolvedAt)
    .sort((a, b) => Number(!!b.escalatedAt) - Number(!!a.escalatedAt) || a.flaggedAt.localeCompare(b.flaggedAt));
  const recovered = (rows ?? []).filter((r) => r.resolvedAt);
  const escalated = open.filter((r) => r.escalatedAt).length;

  return (
    <Page>
      <PageHeader title="At risk" description="Students showing two or more warning signs in their team, from the daily check." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Lifebuoy} label="Open cases" value={open.length} tone="warm" compact />
        <StatCard icon={Bell} label="Need you" value={escalated} tone="danger" hint="Still behind 3 days after the nudge" compact />
        <StatCard icon={HandHeart} label="Recovered" value={recovered.length} tone="success" hint="Last 30 days" compact />
      </div>

      {rows === undefined ? (
        <div className="space-y-3" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <>
          <section aria-labelledby="at-risk-open" className="space-y-3">
            <h2 id="at-risk-open" className="text-lg font-bold">Open cases</h2>
            {open.length ? (
              <ul className="space-y-3">{open.map((s) => <StudentCard key={`${s.teamId}:${s.userId}`} s={s} />)}</ul>
            ) : (
              <Card><EmptyState icon={CheckCircle} title="Nobody is falling behind" description="When a student shows two warning signs, they get a private nudge and appear here." /></Card>
            )}
          </section>

          {recovered.length > 0 && (
            <section aria-labelledby="at-risk-recovered" className="space-y-3">
              <h2 id="at-risk-recovered" className="text-lg font-bold">Recovered</h2>
              <ul className="space-y-3">{recovered.map((s) => <StudentCard key={`${s.teamId}:${s.userId}`} s={s} />)}</ul>
            </section>
          )}
        </>
      )}

      <Card className="flex gap-3 p-5 text-sm text-muted-foreground">
        <Info weight="fill" className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <p>
          Every morning each student is checked for three signs: 2+ overdue tasks (or one 3+ days late), a week silent in team chat while teammates talk,
          and peer reviews averaging 2.5 of 5 or lower. Two signs together send the student a private check-in. If they still hold 3 days later, you are told.
          Students never see this page.
        </p>
      </Card>
    </Page>
  );
}
