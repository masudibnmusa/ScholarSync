"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CaretUpDown, Check, CheckCircle, Lock, MagnifyingGlass, Plus, Target,
} from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn, dueInfo, firstName, toneText } from "@/lib/utils";
import type { KanbanTask, Team } from "@/lib/types";
import { Page } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { ChatWidget } from "@/components/student/chat";
import { TaskBoard, TaskDialog } from "@/components/student/kanban";
import { AiSuggestionsButton, MeetingButton, MembersButton, NoTeam, WeeklyRecapButton } from "@/components/student/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/overlays";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StandupButton } from "@/components/app/standup";
import { RepoButton } from "@/components/app/repo";
import { CharterButton } from "@/components/app/charter";
import { useT } from "@/components/locale";
import { num } from "@/lib/i18n";


function TeamSwitcher({ team }: { team: Team }) {
  const { t } = useT();
  const teams = useAppStore((s) => s.teams);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const badge = (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar text-base font-extrabold text-brand shadow-soft">
      {team.name.replace(/^team\s+/i, "").charAt(0).toUpperCase()}
    </span>
  );
  const label = (
    <span className="min-w-0 text-left">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-base font-extrabold leading-tight">{team.name}</span>
        {teams.length > 1 && <CaretUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </span>
      {team.description && <span className="block truncate text-xs text-muted-foreground">{team.description}</span>}
    </span>
  );
  if (teams.length < 2) return <div className="flex min-w-0 items-center gap-3">{badge}{label}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="-m-1 flex min-w-0 items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-accent" aria-label={t("Switch team. Current: {name}", { name: team.name })}>
        {badge}{label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{t("Your teams")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={team.id} onValueChange={(id) => setSelectedTeam(teams.find((tt) => tt.id === id) ?? null)}>
          {teams.map((tt) => <DropdownMenuRadioItem key={tt.id} value={tt.id}>{tt.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One line that answers "what should I do next?". */
function FocusStrip({ onOpen }: { onOpen: (tt: KanbanTask) => void }) {
  const { t } = useT();
  const user = useUser();
  const tasks = useAppStore((s) => s.kanbanTasks);
  const loaded = useAppStore((s) => s.loaded.tasks);
  const updateTask = useAppStore((s) => s.updateTask);
  if (!loaded) return <Skeleton className="h-9 w-80" />;
  const mine = tasks.filter((tt) => tt.assigneeId === user.id && tt.status !== "done").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const next = mine[0];
  if (!next) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle weight="fill" className="size-4 text-success" aria-hidden />
        {t("Nothing assigned to you, {name}. Pick something up from To do.", { name: firstName(user.name) })}
      </p>
    );
  }
  const due = dueInfo(next.dueDate);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card py-1 pl-2.5 pr-1 shadow-soft">
      <Target weight="duotone" className="size-4 shrink-0 text-warm-text" aria-hidden />
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Up next")}</span>
      <button type="button" onClick={() => onOpen(next)} className="min-w-0 truncate rounded text-sm font-semibold hover:text-primary hover:underline">{next.title}</button>
      {due && <span className={cn("shrink-0 text-xs font-semibold", toneText[due.tone])}>{due.label}</span>}
      {mine.length > 1 && <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">+{num(mine.length - 1)} {t("more")}</span>}
      <Tooltip label={t("Mark done")}>
        <button type="button" onClick={() => updateTask(next.id, { status: "done" })} aria-label={t("Mark \"{title}\" as done", { title: next.title })}
          className="tap flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-success/12 hover:text-success">
          <Check weight="bold" className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}

export function StudentWorkspace() {
  const { t } = useT();
  const team = useAppStore((s) => s.selectedTeam);
  const loaded = useAppStore((s) => s.loaded.teams);
  const tasks = useAppStore((s) => s.kanbanTasks);
  const user = useUser();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wantsNew = params.get("new") === "1";

  const [scope, setScope] = React.useState<"all" | "mine">("all");
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KanbanTask | null>(null);

  const openTask = (tt: KanbanTask | null) => { setEditing(tt); setDialogOpen(true); };

  // Links from notifications: ?team=<id> selects that team, ?task=<id> then opens the task once the board has loaded.
  const teams = useAppStore((s) => s.teams);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const tasksLoaded = useAppStore((s) => s.loaded.tasks);
  const teamParam = params.get("team");
  const taskParam = params.get("task");
  const linkedTeam = teams.find((tt) => tt.id === teamParam);
  React.useEffect(() => {
    if (linkedTeam && team?.id !== linkedTeam.id) setSelectedTeam(linkedTeam);
  }, [linkedTeam, team?.id, setSelectedTeam]);
  const linkedTask = taskParam && tasksLoaded && (!linkedTeam || team?.id === linkedTeam.id) ? tasks.find((tt) => tt.id === taskParam) : undefined;

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open && (wantsNew || taskParam)) router.replace(pathname, { scroll: false }); // ?new=1 / ?task= came from a link; clear it
  };

  if (!loaded) {
    return (
      <div className="flex h-full flex-col gap-4 p-4 lg:p-6" aria-busy="true" aria-label={t("Loading your workspace")}>
        <Skeleton className="h-12 w-80" />
        <div className="flex min-h-0 flex-1 gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-full flex-1 rounded-3xl" />)}</div>
      </div>
    );
  }
  if (!team) return <Page><h1 className="sr-only">{t("Workspace")}</h1><Card><NoTeam /></Card></Page>;

  const done = tasks.filter((tt) => tt.status === "done").length;
  const q = query.trim().toLowerCase();
  const shown = tasks.filter((tt) => (scope === "all" || tt.assigneeId === user.id) && (!q || `${tt.title} ${tt.description} ${tt.assigneeName}`.toLowerCase().includes(q))).length;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <h1 className="sr-only">{team.name} {t("workspace")}</h1>

      {/* Team bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b bg-card/70 px-4 py-3 backdrop-blur lg:px-6">
        <TeamSwitcher team={team} />
        <div className="hidden w-44 flex-col gap-1 md:flex">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold text-muted-foreground">{t("{n} of {total} done", { n: done, total: tasks.length })}</span>
            <span className="font-extrabold tabular-nums">{num(team.progress)}%</span>
          </div>
          <Progress value={team.progress} label={t("{name} progress", { name: team.name })} className="h-1.5" />
        </div>
        <MembersButton team={team} />

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <MeetingButton team={team} />
          <CharterButton team={team} />
          <StandupButton team={team} />
          <RepoButton team={team} />
          <WeeklyRecapButton team={team} />
          <AiSuggestionsButton />
          {!team.courseArchived && <Button onClick={() => openTask(null)}><Plus weight="bold" aria-hidden /> <span className="hidden sm:inline">{t("New task")}</span><span className="sm:hidden">{t("New")}</span></Button>}
        </div>
      </header>
      {team.courseArchived && (
        <p role="status" className="flex shrink-0 items-center gap-2 border-b bg-muted/60 px-4 py-2 text-sm lg:px-6">
          <Lock weight="duotone" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span><strong>{team.courseCode} {t("is archived.")}</strong> {t("You can read your team's tasks, chat and files, but they can't be changed.")}</span>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Board */}
        <section aria-label={t("Task board")} className="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={t("Show tasks")} value={scope} onChange={setScope} options={[{ value: "all", label: t("Everyone") }, { value: "mine", label: t("Mine") }]} />
            <div className="relative w-full max-w-60">
              <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Filter tasks…")} aria-label={t("Filter tasks")} className="h-9 pl-10 md:h-9" />
            </div>
            {(scope !== "all" || q) && <p className="text-sm text-muted-foreground" role="status">{t("{n} of {total}", { n: shown, total: tasks.length })}</p>}
            <div className="ml-auto hidden min-w-0 md:block"><FocusStrip onOpen={openTask} /></div>
          </div>
          <div className="min-h-0 flex-1">
            <TaskBoard scope={scope} query={query} onEdit={openTask} />
          </div>
        </section>
      </div>

      <ChatWidget key={team.id} team={team} />

      <TaskDialog open={dialogOpen || wantsNew || !!linkedTask} onOpenChange={closeDialog} task={linkedTask && !dialogOpen ? linkedTask : wantsNew && !dialogOpen ? null : editing} team={team} />
    </div>
  );
}
