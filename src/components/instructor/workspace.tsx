"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ChatsCircle, Check, FolderOpen, Kanban, MagnifyingGlass, ShieldCheck, Sparkle, UsersThree, Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn, healthInfo, timeAgo, toneVar } from "@/lib/utils";
import type { ConflictAlert, Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { HealthBadge, severityBadge } from "@/components/instructor/charts";
import { ChatThread } from "@/components/student/chat";
import { FilesView } from "@/components/student/files";
import { TaskBoard } from "@/components/student/kanban";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EASE } from "@/components/ui/motion";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";

type Dock = "chat" | "files" | "alerts";
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
  const [dock, setDock] = React.useState<Dock>("chat");
  const [mobilePane, setMobilePane] = React.useState<"board" | "dock">("board");

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
    .filter((t) => !q || `${t.name} ${t.description} ${t.members.map((m) => m.name).join(" ")}`.toLowerCase().includes(q))
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
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Team or student…" aria-label="Search teams or students" className="h-9 pl-10 md:h-9" />
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
        <section aria-label={current.name} className={cn("min-w-0 flex-1 flex-col lg:flex", teamParam ? "flex" : "hidden")}>
          <header className="shrink-0 border-b bg-card/70 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild variant="ghost" size="icon" className="-ml-2 lg:hidden"><Link href={pathname} aria-label="Back to teams"><ArrowLeft className="size-5" /></Link></Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-extrabold">{current.name}</h2>
                  <HealthBadge score={current.healthScore} />
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
              <ul className="ml-auto hidden items-center gap-1.5 xl:flex" aria-label="Members and their share of completed tasks">
                {current.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3">
                    <Avatar name={m.name} size="xs" />
                    <span className="max-w-28 truncate text-xs font-semibold">{m.name}</span>
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">{m.contribution}%</span>
                  </li>
                ))}
              </ul>
              <div className="ml-auto xl:hidden"><AvatarStack names={current.members.map((m) => m.name)} /></div>
            </div>
          </header>

          <div className="shrink-0 px-4 pt-3 lg:hidden">
            <Segmented label="Team section" value={mobilePane === "board" ? "board" : dock} className="w-full [&>button]:flex-1 [&>button]:justify-center"
              onChange={(v) => { if (v === "board") setMobilePane("board"); else { setDock(v as Dock); setMobilePane("dock"); } }}
              options={[
                { value: "board", label: <><Kanban aria-hidden className="size-4" />Board</> },
                { value: "chat", label: <><ChatsCircle aria-hidden className="size-4" />Chat</> },
                { value: "files", label: <><FolderOpen aria-hidden className="size-4" />Files</> },
                { value: "alerts", label: <><Warning aria-hidden className="size-4" />Alerts{currentOpen > 0 && <span className="size-1.5 rounded-full bg-destructive" aria-hidden />}</> },
              ]} />
          </div>

          <div className="flex min-h-0 flex-1">
            <div className={cn("min-w-0 flex-1 flex-col p-4 lg:flex lg:p-6", mobilePane === "board" ? "flex" : "hidden")}>
              <AnimatePresence mode="wait">
                <motion.div key={current.id} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                  <TaskBoard readOnly />
                </motion.div>
              </AnimatePresence>
            </div>

            <aside aria-label="Team activity" className={cn("min-h-0 w-full shrink-0 flex-col border-l bg-card lg:flex lg:w-[21rem] 2xl:w-[26rem]", mobilePane === "dock" ? "flex" : "hidden")}>
              <div className="hidden shrink-0 border-b p-3 lg:block">
                <Segmented label="Team activity" value={dock} onChange={setDock} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[
                  { value: "chat", label: <><ChatsCircle aria-hidden className="size-4" />Chat</> },
                  { value: "files", label: <><FolderOpen aria-hidden className="size-4" />Files</> },
                  { value: "alerts", label: <><Warning aria-hidden className="size-4" />Alerts{currentOpen > 0 && <span className="rounded-full bg-destructive px-1.5 text-[0.625rem] font-extrabold text-destructive-foreground">{currentOpen}</span>}</> },
                ]} />
              </div>
              <div className="min-h-0 flex-1">
                {dock === "chat" && <ChatThread key={current.id} team={current} readOnly />}
                {dock === "files" && <div className="h-full overflow-y-auto p-4 scroll-thin"><FilesView team={current} readOnly /></div>}
                {dock === "alerts" && (
                  <div className="h-full overflow-y-auto scroll-thin">
                    <AlertsList alerts={teamAlerts} />
                    <div className="px-4 pb-4">
                      <Button asChild variant="ghost" size="sm" className="w-full"><Link href="/instructor/conflicts">All conflict alerts <ArrowRight aria-hidden /></Link></Button>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
