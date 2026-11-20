"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, MagnifyingGlass, ShieldCheck, Sparkle, UsersThree, Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn, healthInfo, timeAgo, toneVar } from "@/lib/utils";
import type { ConflictAlert, Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { HealthBadge, severityBadge } from "@/components/instructor/charts";
import { EditTeamButton } from "@/components/instructor/edit-team";
import { ChatWidget } from "@/components/student/chat";
import { TaskBoard } from "@/components/student/kanban";
import { MembersButton, WeeklyRecapButton } from "@/components/student/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EASE } from "@/components/ui/motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";

type Sort = "health" | "progress" | "name";

function TeamRow({ team, active, alerts, onSelect }: { team: Team; active: boolean; alerts: number; onSelect: () => void }) {
  const h = healthInfo(team.healthScore);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative w-full rounded-2xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200",
        active ? "border-primary/50 bg-card shadow-lift" : "border-transparent hover:border-border hover:bg-card hover:shadow-soft",
      )}
    >
      {active && <motion.span layoutId="team-row-bar" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-warm" aria-hidden />}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{team.name}</span>
        <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.6875rem] font-bold text-secondary-foreground" title="Course">{team.courseCode}</span>
        {alerts > 0 && <Badge variant="danger"><Warning weight="fill" aria-hidden />{alerts}<span className="sr-only"> open {alerts === 1 ? "alert" : "alerts"}</span></Badge>}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: toneVar[h.tone] }} aria-hidden />
        <span className="font-semibold">{h.label}</span>
        <span aria-hidden>·</span>
        <span>{team.members.length} members</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <Progress value={team.progress} label={`${team.name} progress`} className="h-1.5" />
        <span className="w-9 text-right text-xs font-bold tabular-nums">{team.progress}%</span>
      </div>
    </button>
  );
}

function AlertsList({ alerts }: { alerts: ConflictAlert[] }) {
  const resolve = useAppStore((s) => s.resolveConflict);
  const [busy, setBusy] = React.useState<string | null>(null);
  if (alerts.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No alerts for this team" description="The nightly AI check hasn't flagged friction or silence here." className="py-10" />;
  }
  return (
    <ul className="space-y-3 p-4">
      {alerts.map((a) => {
        const sev = a.severity as keyof typeof severityBadge;
        return (
          <li key={a.id} className={cn("rounded-2xl border bg-background p-4", a.isResolved && "opacity-70")}>
            <div className="flex flex-wrap items-center gap-2">
              {a.isResolved ? <Badge variant="success">Resolved</Badge> : <Badge variant={severityBadge[sev] ?? "muted"} className="capitalize"><Warning weight="fill" aria-hidden />{a.severity}</Badge>}
              <time dateTime={a.createdAt} className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</time>
              <span className="ml-auto text-xs text-muted-foreground">Tone {a.sentimentScore > 0 ? "+" : ""}{a.sentimentScore.toFixed(2)}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{a.description}</p>
            {!a.isResolved && (
              <Button size="sm" variant="outline" className="mt-3" loading={busy === a.id}
                onClick={async () => { setBusy(a.id); await resolve(a.id); setBusy(null); toast.success("Alert resolved"); }}>
                <Check weight="bold" aria-hidden /> Mark resolved
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Header button next to the health badge: the team's conflict alerts in a dropdown. */
function TeamAlertsButton({ alerts, open }: { alerts: ConflictAlert[]; open: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 rounded-full px-2.5 text-xs", open > 0 && "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive")}
          aria-label={open ? `Conflict alerts, ${open} open` : "Conflict alerts, none open"}>
          <Warning weight={open ? "fill" : "regular"} className="size-3.5" aria-hidden />
          {open ? `${open} open ${open === 1 ? "alert" : "alerts"}` : "No alerts"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-bold">Conflict alerts</p>
          <span className="text-xs font-semibold text-muted-foreground">{open ? `${open} open` : "Nothing open"}</span>
        </div>
        <div className="max-h-[min(28rem,60dvh)] overflow-y-auto scroll-thin"><AlertsList alerts={alerts} /></div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full"><Link href="/instructor/conflicts">All conflict alerts <ArrowRight aria-hidden /></Link></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InstructorWorkspace() {
  const teams = useAppStore((s) => s.teams);
  const loaded = useAppStore((s) => s.loaded.teams);
  const selected = useAppStore((s) => s.selectedTeam);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const alerts = useAppStore((s) => s.conflictAlerts);

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const teamParam = params.get("team");

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("health");

  // ?team=<id> picks the team, so a team can be linked to and Back returns to the list on phones.
  const fromUrl = teams.find((t) => t.id === teamParam) ?? null;
  const current = fromUrl ?? selected;
  React.useEffect(() => {
    if (fromUrl && selected?.id !== fromUrl.id) setSelectedTeam(fromUrl);
  }, [fromUrl, selected?.id, setSelectedTeam]);

  const openCount = (id: string) => alerts.filter((a) => a.teamId === id && !a.isResolved).length;
  const open = alerts.filter((a) => !a.isResolved);

  if (!loaded) {
    return (
      <div className="flex h-full gap-4 p-4 lg:p-6" aria-busy="true" aria-label="Loading teams">
        <Skeleton className="hidden h-full w-72 rounded-3xl lg:block" />
        <Skeleton className="h-full flex-1 rounded-3xl" />
      </div>
    );
  }
  if (teams.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <h1 className="sr-only">Workspace</h1>
        <EmptyState icon={UsersThree} title="No teams yet" description="Let AI group your enrolled students by complementary skills and matching availability. You approve every team before it is created.">
          <Button asChild variant="warm"><Link href="/instructor/matching"><Sparkle weight="fill" aria-hidden /> Match students into teams</Link></Button>
        </EmptyState>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const list = teams
    .filter((t) => !q || `${t.name} ${t.courseCode} ${t.description} ${t.members.map((m) => m.name).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "health" ? a.healthScore - b.healthScore : b.progress - a.progress));
  const avgProgress = Math.round(teams.reduce((n, t) => n + t.progress, 0) / teams.length);
  const teamAlerts = current ? alerts.filter((a) => a.teamId === current.id).sort((a, b) => Number(a.isResolved) - Number(b.isResolved)) : [];
  const currentOpen = current ? openCount(current.id) : 0;

  return (
    <div className="flex h-full min-h-0">
      <h1 className="sr-only">Teams workspace</h1>

      {/* Team list */}
      <aside aria-label="Teams" className={cn("min-h-0 w-full shrink-0 flex-col border-r bg-muted/40 lg:flex lg:w-[17rem]", teamParam ? "hidden" : "flex")}>
        <div className="space-y-3 p-4 pb-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold">Teams</h2>
            <span className="text-xs font-semibold text-muted-foreground">{teams.length} total</span>
          </div>
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Team, student or course…" aria-label="Search teams, students or courses" className="h-9 pl-10 md:h-9" />
          </div>
          <Segmented label="Sort teams" value={sort} onChange={setSort} className="w-full [&>button]:flex-1 [&>button]:justify-center"
            options={[{ value: "health", label: "Attention" }, { value: "progress", label: "Progress" }, { value: "name", label: "A–Z" }]} />
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3 scroll-thin">
          {list.map((t) => (
            <li key={t.id}>
              <TeamRow team={t} active={current?.id === t.id} alerts={openCount(t.id)} onSelect={() => router.push(`${pathname}?team=${t.id}`, { scroll: false })} />
            </li>
          ))}
          {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No team or student matches “{query}”.</li>}
        </ul>
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Link href="/instructor/analytics" className="rounded-xl bg-card p-3 shadow-soft transition-shadow hover:shadow-lift">
            <p className="text-xs font-medium text-muted-foreground">Avg progress</p>
            <p className="text-lg font-extrabold tabular-nums">{avgProgress}%</p>
          </Link>
          <Link href="/instructor/conflicts" className="rounded-xl bg-card p-3 shadow-soft transition-shadow hover:shadow-lift">
            <p className="text-xs font-medium text-muted-foreground">Open alerts</p>
            <p className={cn("text-lg font-extrabold tabular-nums", open.length && "text-destructive")}>{open.length}</p>
          </Link>
        </div>
      </aside>

      {/* Selected team */}
      {current && (
        <section aria-label={current.name} className={cn("relative min-w-0 flex-1 flex-col lg:flex", teamParam ? "flex" : "hidden")}>
          <header className="shrink-0 border-b bg-card/70 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild variant="ghost" size="icon" className="-ml-2 lg:hidden"><Link href={pathname} aria-label="Back to teams"><ArrowLeft className="size-5" /></Link></Button>
              <div className="min-w-0 flex-1 md:flex-none">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-extrabold">{current.name}</h2>
                  <Link href={`/instructor/courses/${current.courseId}`} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs font-bold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground" aria-label={`Course ${current.courseCode}`}>{current.courseCode}</Link>
                  <HealthBadge score={current.healthScore} />
                  <TeamAlertsButton alerts={teamAlerts} open={currentOpen} />
                </div>
                {current.description && <p className="truncate text-xs text-muted-foreground">{current.description}</p>}
              </div>
              <div className="hidden min-w-40 flex-col gap-1 md:flex">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-muted-foreground">{current._count?.tasks ?? 0} tasks</span>
                  <span className="font-extrabold tabular-nums">{current.progress}%</span>
                </div>
                <Progress value={current.progress} label={`${current.name} progress`} className="h-1.5" />
              </div>
              <div className="ml-auto flex items-center gap-2"><WeeklyRecapButton team={current} /><EditTeamButton team={current} /><MembersButton team={current} align="end" /></div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col p-4 lg:p-6">
              <AnimatePresence mode="wait">
                <motion.div key={current.id} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                  <TaskBoard readOnly />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <ChatWidget key={current.id} team={current} instructor />
        </section>
      )}
    </div>
  );
}
