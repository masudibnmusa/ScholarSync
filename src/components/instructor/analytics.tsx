"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, CaretDown, CaretUp, ChartLineUp, ChatsCircle, CheckCircle, Heartbeat, ListChecks, Pulse, Scales, Sparkle, UsersThree, Warning,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { cn, healthInfo, toneVar } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { EmptyState, Page } from "@/components/app/page";
import { GroupedBars, HealthBadge } from "@/components/instructor/charts";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber, EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import { Progress, ProgressRing } from "@/components/ui/progress";
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
  { key: "progress", label: "Progress" },
  { key: "health", label: "Health" },
  { key: "tasks", label: "Tasks", numeric: true },
  { key: "messages", label: "Messages", numeric: true },
];
const valueOf = (t: Team, k: SortKey) =>
  k === "name" ? t.name : k === "members" ? t.members.length : k === "progress" ? t.progress : k === "health" ? t.healthScore : k === "tasks" ? t._count?.tasks ?? 0 : t._count?.messages ?? 0;

// Member slots in the "who is doing the work" split, in the validated chart order.
const memberColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const memberColor = (i: number) => memberColors[i % memberColors.length];
// Lighter status hues that keep contrast on the dark navy hero.
const heroRing = { success: "var(--sage-strong)", warning: "var(--butter-strong)", danger: "var(--rose-strong)" } as const;

/** One figure in the hero: light text on the navy panel. */
function HeroStat({ icon: I, label, value, suffix, hint }: { icon: Icon; label: string; value: number; suffix?: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-4 backdrop-blur-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><I weight="duotone" className="size-4 text-brand" aria-hidden />{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground"><AnimatedNumber value={value} suffix={suffix} /></p>
      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

// Health tone as a pastel card tint, always paired with the badge text.
const cardTint = { success: "bg-sage", warning: "bg-butter", danger: "bg-rose" } as const;

/** Per-team summary card: health ring, progress and activity, linking to the team's workspace. */
function TeamCard({ team, alerts }: { team: Team; alerts: number }) {
  const h = healthInfo(team.healthScore);
  return (
    <Link href={`/instructor?team=${team.id}`} className="group block h-full rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Card interactive className={cn("relative h-full overflow-hidden border-transparent p-5", cardTint[h.tone])}>
        <div className="flex items-start gap-4">
          <ProgressRing value={team.healthScore} size={64} stroke={7} color={toneVar[h.tone]} track="var(--glass-strong)" label={`${team.name} health score`}>
            <span className="text-base font-extrabold tabular-nums">{team.healthScore}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-extrabold">{team.name}</h3>
              <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <HealthBadge score={team.healthScore} showScore={false} />
              {alerts > 0 && <Badge variant="danger"><Warning weight="fill" aria-hidden />{alerts} {alerts === 1 ? "alert" : "alerts"}</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-foreground/70">Progress</span>
            <span className="font-extrabold tabular-nums">{team.progress}%</span>
          </div>
          <Progress value={team.progress} label={`${team.name} progress`} className="h-1.5 bg-glass-strong" />
        </div>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-foreground/10 rounded-xl bg-glass-strong py-2 text-center">
          {([["Members", team.members.length], ["Tasks", team._count?.tasks ?? 0], ["Messages", team._count?.messages ?? 0]] as const).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{k}</dt>
              <dd className="text-sm font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </Link>
  );
}

export function AnalyticsPanel() {
  const teams = useAppStore((s) => s.teams);
  const loaded = useAppStore((s) => s.loaded.teams);
  const alerts = useAppStore((s) => s.conflictAlerts);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "health", dir: 1 });

  if (!loaded) {
    return (
      <Page>
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </Page>
    );
  }
  if (teams.length === 0) {
    return (
      <Page>
        <h1 className="text-2xl font-extrabold sm:text-[1.75rem]">Analytics</h1>
        <Card><EmptyState icon={ChartLineUp} title="Nothing to chart yet" description="Analytics appear as soon as you have teams working on tasks."><Button asChild variant="warm"><Link href="/instructor/matching">Form teams with AI</Link></Button></EmptyState></Card>
      </Page>
    );
  }

  const avg = (f: (t: Team) => number) => Math.round(teams.reduce((n, t) => n + f(t), 0) / teams.length);
  const sum = (f: (t: Team) => number) => teams.reduce((n, t) => n + f(t), 0);
  const openFor = (id: string) => alerts.filter((a) => a.teamId === id && !a.isResolved).length;
  const openTotal = alerts.filter((a) => !a.isResolved).length;
  const byAttention = [...teams].sort((a, b) => a.healthScore - b.healthScore || a.progress - b.progress);
  const worst = byAttention[0];
  const worstHealth = healthInfo(worst.healthScore);
  const avgHealth = avg((t) => t.healthScore);
  const avgHealthInfo = healthInfo(avgHealth);
  const focus = teams.find((t) => t.id === teamId) ?? worst;
  const bal = balance(focus);
  const members = [...focus.members].sort((a, b) => b.contribution - a.contribution);
  const sorted = [...teams].sort((a, b) => {
    const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
    return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
  });
  const byName = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Page className="space-y-8">
      {/* ── Hero: the one thing to know, then the headline numbers ───────────────── */}
      <motion.section
        aria-labelledby="analytics-title"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-3xl bg-peach p-6 text-foreground shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_35%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--warm)_22%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.07]" aria-hidden />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-glass px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">
              <Pulse weight="bold" className="size-3.5" aria-hidden /> Course pulse · {teams.length} {teams.length === 1 ? "team" : "teams"}
            </p>
            <h1 id="analytics-title" className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Analytics</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[0.9375rem]">How your teams are progressing, collaborating and sharing the work.</p>

            {/* Insight callout: the team to look at first */}
            <div className="mt-6 flex max-w-xl flex-wrap items-start gap-3 rounded-2xl border border-glass-border bg-glass p-4 sm:flex-nowrap">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", worstHealth.tone === "success" ? "bg-success/25 text-success" : "bg-warm/25 text-warm-text")}>
                {worstHealth.tone === "success" ? <CheckCircle weight="fill" className="size-5" aria-hidden /> : <Sparkle weight="fill" className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                <p className="font-bold text-foreground">
                  {worstHealth.tone === "success" ? "Every team is on track" : `${worst.name} needs a look`}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {worstHealth.tone === "success"
                    ? `The lowest health score is ${worst.healthScore}, at ${worst.name}.`
                    : `Health ${worst.healthScore} (${worstHealth.label.toLowerCase()}), ${worst.progress}% done${openFor(worst.id) ? `, ${openFor(worst.id)} open ${openFor(worst.id) === 1 ? "alert" : "alerts"}` : ""}.`}
                </p>
              </div>
              {worstHealth.tone !== "success" && (
                <Button asChild size="sm" variant="warm" className="ml-12 shrink-0 sm:ml-0 sm:self-center">
                  <Link href={`/instructor?team=${worst.id}`}>Open <ArrowRight aria-hidden /></Link>
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
            <div className="flex flex-col items-center">
              <ProgressRing value={avgHealth} size={148} stroke={12} color={heroRing[avgHealthInfo.tone]}
                track="var(--glass-strong)" label="Average team health">
                <span className="flex flex-col items-center">
                  <span className="text-4xl font-extrabold tabular-nums text-foreground"><AnimatedNumber value={avgHealth} /></span>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">avg health</span>
                </span>
              </ProgressRing>
              <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Heartbeat weight="fill" className="size-3.5 text-brand" aria-hidden />{avgHealthInfo.label}</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-72">
              <HeroStat icon={ChartLineUp} label="Avg progress" value={avg((t) => t.progress)} suffix="%" hint="Tasks completed" />
              <HeroStat icon={ListChecks} label="Tasks" value={sum((t) => t._count?.tasks ?? 0)} hint="Across all boards" />
              <HeroStat icon={ChatsCircle} label="Messages" value={sum((t) => t._count?.messages ?? 0)} hint="Across all chats" />
              <HeroStat icon={Warning} label="Open alerts" value={openTotal} hint={openTotal ? "Waiting for you" : "All clear"} />
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── Teams at a glance, most in need first ─────────────────────────────────── */}
      <section aria-labelledby="teams-glance" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="teams-glance" className="text-lg font-extrabold">Teams at a glance</h2>
            <p className="text-sm text-muted-foreground">Ordered by who needs attention first. Select a team to open its workspace.</p>
          </div>
        </div>
        <Stagger className={cn("grid gap-4 sm:grid-cols-2", teams.length >= 3 && "xl:grid-cols-3")}>
          {byAttention.map((t) => <StaggerItem key={t.id} className="h-full"><TeamCard team={t} alerts={openFor(t.id)} /></StaggerItem>)}
        </Stagger>
      </section>

      {/* ── Comparisons ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><ChartLineUp weight="duotone" className="size-4" aria-hidden /></span>Progress and health</CardTitle>
              <CardDescription>Both on a 0–100 scale. Far along but unhealthy can mean one person is doing everything.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <GroupedBars label="Progress and health score by team" max={100} series={[{ name: "Progress (%)", color: "var(--chart-1)" }, { name: "Health score", color: "var(--chart-2)" }]}
              rows={[...teams].sort((a, b) => b.healthScore - a.healthScore).map((t) => ({ id: t.id, label: t.name, values: [t.progress, t.healthScore] }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-info/12 text-info"><ChatsCircle weight="duotone" className="size-4" aria-hidden /></span>Activity</CardTitle>
              <CardDescription>Tasks on the board and messages in chat. Quiet teams are often stuck teams.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <GroupedBars label="Tasks and messages by team" series={[{ name: "Tasks", color: "var(--chart-3)" }, { name: "Messages", color: "var(--chart-4)" }]}
              rows={[...teams].sort((a, b) => (b._count?.messages ?? 0) - (a._count?.messages ?? 0)).map((t) => ({ id: t.id, label: t.name, values: [t._count?.tasks ?? 0, t._count?.messages ?? 0] }))} />
          </CardContent>
        </Card>
      </div>

      {/* ── Who is doing the work ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-warm/15 text-warm-text"><Scales weight="duotone" className="size-4" aria-hidden /></span>Who is doing the work</CardTitle>
            <CardDescription>Each member&apos;s share of the team&apos;s completed tasks.</CardDescription>
          </div>
          <div className="w-full sm:w-56">
            <Select value={focus.id} onValueChange={setTeamId}>
              <SelectTrigger aria-label="Team"><SelectValue /></SelectTrigger>
              <SelectContent>{byName.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant={bal.variant}>{bal.label}</Badge>
            <p className="text-sm text-muted-foreground">{bal.note}</p>
          </div>

          {/* One bar split by member share: the proportions at a glance */}
          {members.some((m) => m.contribution > 0) ? (
            <div key={focus.id} className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img"
              aria-label={`Share of completed tasks: ${members.map((m) => `${m.name} ${m.contribution}%`).join(", ")}`}>
              {members.map((m, i) => m.contribution > 0 && (
                <motion.span key={m.userId} className="h-full border-r-2 border-card last:border-r-0" style={{ backgroundColor: memberColor(i) }}
                  initial={{ width: 0 }} animate={{ width: `${m.contribution}%` }} transition={{ duration: 0.8, delay: i * 0.06, ease: EASE }} />
              ))}
            </div>
          ) : (
            <div className="h-4 w-full rounded-full bg-[repeating-linear-gradient(-45deg,var(--muted),var(--muted)_6px,transparent_6px,transparent_12px)]" aria-hidden />
          )}

          {members.length === 0 ? <p className="text-sm text-muted-foreground">This team has no members.</p> : (
            <ul key={focus.id} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m, i) => (
                <li key={m.userId} className="flex items-center gap-3 rounded-2xl border bg-background/60 p-3">
                  <span className="relative">
                    <Avatar name={m.name} size="sm" />
                    <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card" style={{ backgroundColor: memberColor(i) }} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.skills.slice(0, 2).join(" · ") || "No skills listed"}</p>
                  </div>
                  <span className="text-lg font-extrabold tabular-nums">{m.contribution}<span className="text-xs font-bold text-muted-foreground">%</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── All teams table ───────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div>
            <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><UsersThree weight="duotone" className="size-4" aria-hidden /></span>All teams</CardTitle>
            <CardDescription>The same numbers as a table. Select a column heading to sort.</CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[44rem] text-sm">
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
                  <th scope="row" className="px-5 py-3.5 text-left font-bold">
                    <Link href={`/instructor?team=${t.id}`} className="inline-flex items-center gap-2 rounded underline-offset-4 hover:text-primary hover:underline">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-sidebar text-xs font-extrabold text-brand" aria-hidden>{t.name.replace(/^team\s+/i, "").charAt(0).toUpperCase()}</span>
                      {t.name}
                    </Link>
                  </th>
                  <td className="px-5 py-3.5 text-right tabular-nums">{t.members.length}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Progress value={t.progress} label={`${t.name} progress`} className="h-1.5 w-24" />
                      <span className="w-9 text-right font-semibold tabular-nums">{t.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><HealthBadge score={t.healthScore} /></td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{t._count?.tasks ?? 0}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{t._count?.messages ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
