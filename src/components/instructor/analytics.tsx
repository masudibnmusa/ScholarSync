"use client";

import * as React from "react";
import Link from "next/link";
import { CaretDown, CaretUp, ChartLineUp, ChatsCircle, Heartbeat, ListChecks, Scales, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { EmptyState, Page, PageHeader, StatCard } from "@/components/app/page";
import { GroupedBars, HealthBadge } from "@/components/instructor/charts";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** How evenly completed work is shared: the gap between the busiest member's share and an equal share. */
function balance(team: Team): { label: string; variant: "success" | "warning" | "danger" | "muted"; note: string } {
  const shares = team.members.map((m) => m.contribution);
  const total = shares.reduce((a, b) => a + b, 0);
  if (!team.members.length || total === 0) return { label: "No data yet", variant: "muted", note: "No tasks have been completed yet." };
  const fair = 100 / team.members.length;
  const gap = Math.max(...shares) - fair;
  const idle = shares.filter((s) => s === 0).length;
  if (gap <= 15 && !idle) return { label: "Balanced", variant: "success", note: "Work is shared evenly across the team." };
  if (gap <= 35) return { label: "Slightly uneven", variant: "warning", note: idle ? `${idle} ${idle === 1 ? "member has" : "members have"} not completed a task yet.` : "One member is carrying a bit more than the rest." };
  return { label: "Uneven", variant: "danger", note: "One member is doing most of the completed work. Worth a check-in." };
}

type SortKey = "name" | "members" | "progress" | "health" | "tasks" | "messages";
const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Team" },
  { key: "members", label: "Members", numeric: true },
  { key: "progress", label: "Progress", numeric: true },
  { key: "health", label: "Health" },
  { key: "tasks", label: "Tasks", numeric: true },
  { key: "messages", label: "Messages", numeric: true },
];
const valueOf = (t: Team, k: SortKey) =>
  k === "name" ? t.name : k === "members" ? t.members.length : k === "progress" ? t.progress : k === "health" ? t.healthScore : k === "tasks" ? t._count?.tasks ?? 0 : t._count?.messages ?? 0;

export function AnalyticsPanel() {
  const teams = useAppStore((s) => s.teams);
  const loaded = useAppStore((s) => s.loaded.teams);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "health", dir: 1 });

  if (!loaded) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </Page>
    );
  }
  if (teams.length === 0) {
    return (
      <Page>
        <PageHeader title="Analytics" />
        <Card><EmptyState icon={ChartLineUp} title="Nothing to chart yet" description="Analytics appear as soon as you have teams working on tasks."><Button asChild variant="warm"><Link href="/instructor/matching">Form teams with AI</Link></Button></EmptyState></Card>
      </Page>
    );
  }

  const avg = (f: (t: Team) => number) => Math.round(teams.reduce((n, t) => n + f(t), 0) / teams.length);
  const sum = (f: (t: Team) => number) => teams.reduce((n, t) => n + f(t), 0);
  const focus = teams.find((t) => t.id === teamId) ?? [...teams].sort((a, b) => a.healthScore - b.healthScore)[0];
  const bal = balance(focus);
  const sorted = [...teams].sort((a, b) => {
    const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
    return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
  });
  const byName = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Page>
      <PageHeader title="Analytics" description="How your teams are progressing, collaborating and sharing the work." />

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard icon={ChartLineUp} label="Average progress" value={avg((t) => t.progress)} suffix="%" hint="Tasks completed" /></StaggerItem>
        <StaggerItem><StatCard icon={Heartbeat} label="Average health" value={avg((t) => t.healthScore)} tone="success" hint="Out of 100, from the AI check" /></StaggerItem>
        <StaggerItem><StatCard icon={ListChecks} label="Tasks tracked" value={sum((t) => t._count?.tasks ?? 0)} tone="info" hint="Across all boards" /></StaggerItem>
        <StaggerItem><StatCard icon={ChatsCircle} label="Messages sent" value={sum((t) => t._count?.messages ?? 0)} tone="warm" hint="Across all team chats" /></StaggerItem>
      </Stagger>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Progress and health</CardTitle><CardDescription>Both on a 0–100 scale. A team that is far along but unhealthy may be one person doing everything.</CardDescription></div></CardHeader>
          <CardContent>
            <GroupedBars label="Progress and health score by team" max={100} series={[{ name: "Progress (%)", color: "var(--chart-1)" }, { name: "Health score", color: "var(--chart-2)" }]}
              rows={byName.map((t) => ({ id: t.id, label: t.name, values: [t.progress, t.healthScore] }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Activity</CardTitle><CardDescription>Tasks on the board and messages in chat. Quiet teams are often stuck teams.</CardDescription></div></CardHeader>
          <CardContent>
            <GroupedBars label="Tasks and messages by team" series={[{ name: "Tasks", color: "var(--chart-3)" }, { name: "Messages", color: "var(--chart-4)" }]}
              rows={byName.map((t) => ({ id: t.id, label: t.name, values: [t._count?.tasks ?? 0, t._count?.messages ?? 0] }))} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Scales weight="duotone" className="size-5 text-primary" aria-hidden /> Who is doing the work</CardTitle>
            <CardDescription>Each member's share of the team's completed tasks.</CardDescription>
          </div>
          <div className="w-full sm:w-56">
            <Select value={focus.id} onValueChange={setTeamId}>
              <SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger>
              <SelectContent>{byName.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-xl bg-muted px-3.5 py-2.5">
            <Badge variant={bal.variant}>{bal.label}</Badge>
            <p className="text-sm text-muted-foreground">{bal.note}</p>
          </div>
          {focus.members.length === 0 ? <p className="text-sm text-muted-foreground">This team has no members.</p> : (
            <ul key={focus.id} className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[...focus.members].sort((a, b) => b.contribution - a.contribution).map((m) => (
                <li key={m.userId}>
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <Avatar name={m.name} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</p>
                    <span className="text-sm font-extrabold tabular-nums">{m.contribution}%</span>
                  </div>
                  <Progress value={m.contribution} label={`${m.name}: share of completed tasks`} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-4"><div><CardTitle className="flex items-center gap-2"><UsersThree weight="duotone" className="size-5 text-primary" aria-hidden /> All teams</CardTitle><CardDescription>The same numbers as a table. Select a column heading to sort.</CardDescription></div></CardHeader>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-y bg-muted/50 text-left">
                {columns.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cn("px-5 py-0 font-semibold", c.numeric && "text-right")}>
                      <button type="button" onClick={() => setSort({ key: c.key, dir: active ? (sort.dir === 1 ? -1 : 1) : c.key === "name" ? 1 : -1 })}
                        className={cn("inline-flex h-10 items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}>
                        {c.label}
                        {active ? (sort.dir === 1 ? <CaretUp weight="bold" className="size-3" aria-hidden /> : <CaretDown weight="bold" className="size-3" aria-hidden />) : <span className="size-3" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-accent/40">
                  <th scope="row" className="px-5 py-3 text-left font-bold"><Link href={`/instructor?team=${t.id}`} className="rounded underline-offset-4 hover:text-primary hover:underline">{t.name}</Link></th>
                  <td className="px-5 py-3 text-right tabular-nums">{t.members.length}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{t.progress}%</td>
                  <td className="px-5 py-3"><HealthBadge score={t.healthScore} /></td>
                  <td className="px-5 py-3 text-right tabular-nums">{t._count?.tasks ?? 0}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{t._count?.messages ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
