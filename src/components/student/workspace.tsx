"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretUpDown, ChatsCircle, Check, CheckCircle, FolderOpen, Kanban, MagnifyingGlass, Plus, SidebarSimple, Target,
} from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn, dueInfo, firstName, healthInfo, toneText } from "@/lib/utils";
import type { KanbanTask, Team } from "@/lib/types";
import { Page } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { ChatThread } from "@/components/student/chat";
import { FilesView } from "@/components/student/files";
import { TaskBoard, TaskDialog } from "@/components/student/kanban";
import { AiSuggestionsButton, NoTeam } from "@/components/student/shared";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoredValue } from "@/hooks/use-client";

type View = "board" | "chat" | "files";
const DOCK_KEY = "scholarsync:chat-dock";

function TeamSwitcher({ team }: { team: Team }) {
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
      <DropdownMenuTrigger className="-m-1 flex min-w-0 items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-accent" aria-label={`Switch team. Current: ${team.name}`}>
        {badge}{label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Your teams</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={team.id} onValueChange={(id) => setSelectedTeam(teams.find((t) => t.id === id) ?? null)}>
          {teams.map((t) => <DropdownMenuRadioItem key={t.id} value={t.id}>{t.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Avatars that open a breakdown of who has done what. */
function MembersButton({ team }: { team: Team }) {
  const user = useUser();
  const health = healthInfo(team.healthScore);
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-2 rounded-full p-1 pr-2.5 transition-colors hover:bg-accent" aria-label={`${team.members.length} members. Show contribution`}>
        <AvatarStack names={team.members.map((m) => m.name)} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold">Who&apos;s done what</p>
          <span className={cn("text-xs font-semibold", toneText[health.tone])}>{health.label}</span>
        </div>
        <ul className="mt-3 space-y-3">
          {team.members.map((m) => (
            <li key={m.userId}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <Avatar name={m.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}{m.userId === user.id && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                <span className="text-sm font-bold tabular-nums">{m.contribution}%</span>
              </div>
              <Progress value={m.contribution} label={`${m.name}: share of completed tasks`} color={m.userId === user.id ? "var(--warm)" : "var(--primary)"} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Share of the team&apos;s completed tasks.</p>
      </PopoverContent>
    </Popover>
  );
}

/** One line that answers "what should I do next?". */
function FocusStrip({ onOpen }: { onOpen: (t: KanbanTask) => void }) {
  const user = useUser();
  const tasks = useAppStore((s) => s.kanbanTasks);
  const loaded = useAppStore((s) => s.loaded.tasks);
  const updateTask = useAppStore((s) => s.updateTask);
  if (!loaded) return <Skeleton className="h-9 w-80" />;
  const mine = tasks.filter((t) => t.assigneeId === user.id && t.status !== "done").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const next = mine[0];
  if (!next) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle weight="fill" className="size-4 text-success" aria-hidden />
        Nothing assigned to you, {firstName(user.name)}. Pick something up from To do.
      </p>
    );
  }
  const due = dueInfo(next.dueDate);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card py-1 pl-2.5 pr-1 shadow-soft">
      <Target weight="duotone" className="size-4 shrink-0 text-warm-text" aria-hidden />
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">Up next</span>
      <button type="button" onClick={() => onOpen(next)} className="min-w-0 truncate rounded text-sm font-semibold hover:text-primary hover:underline">{next.title}</button>
      {due && <span className={cn("shrink-0 text-xs font-semibold", toneText[due.tone])}>{due.label}</span>}
      {mine.length > 1 && <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">+{mine.length - 1} more</span>}
      <Tooltip label="Mark done">
        <button type="button" onClick={() => updateTask(next.id, { status: "done" })} aria-label={`Mark "${next.title}" as done`}
          className="tap flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-success/12 hover:text-success">
          <Check weight="bold" className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}

export function StudentWorkspace() {
  const team = useAppStore((s) => s.selectedTeam);
  const loaded = useAppStore((s) => s.loaded.teams);
  const tasks = useAppStore((s) => s.kanbanTasks);
  const fileCount = useAppStore((s) => s.files.length);
  const suggestions = useAppStore((s) => s.taskSuggestions.length);
  const user = useUser();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = (["chat", "files"].includes(params.get("view") ?? "") ? params.get("view") : "board") as View;
  const wantsNew = params.get("new") === "1";

  const [dockPref, setDockPref] = useStoredValue(DOCK_KEY, true);
  const dockOpen = dockPref || view === "chat";
  const [scope, setScope] = React.useState<"all" | "mine">("all");
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KanbanTask | null>(null);
  const [filesOpen, setFilesOpen] = React.useState(false);

  const setView = (v: View) => router.replace(v === "board" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  const openTask = (t: KanbanTask | null) => { setEditing(t); setDialogOpen(true); };
  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open && wantsNew) router.replace(pathname, { scroll: false }); // ?new=1 came from a link; clear it
  };
  const closeDock = () => {
    setDockPref(false);
    if (view === "chat") setView("board");
  };

  if (!loaded) {
    return (
      <div className="flex h-full flex-col gap-4 p-4 lg:p-6" aria-busy="true" aria-label="Loading your workspace">
        <Skeleton className="h-12 w-80" />
        <div className="flex min-h-0 flex-1 gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-full flex-1 rounded-3xl" />)}</div>
      </div>
    );
  }
  if (!team) return <Page><h1 className="sr-only">Workspace</h1><Card><NoTeam /></Card></Page>;

  const done = tasks.filter((t) => t.status === "done").length;
  const q = query.trim().toLowerCase();
  const shown = tasks.filter((t) => (scope === "all" || t.assigneeId === user.id) && (!q || `${t.title} ${t.description} ${t.assigneeName}`.toLowerCase().includes(q))).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h1 className="sr-only">{team.name} workspace</h1>

      {/* Team bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b bg-card/70 px-4 py-3 backdrop-blur lg:px-6">
        <TeamSwitcher team={team} />
        <div className="hidden w-44 flex-col gap-1 md:flex">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold text-muted-foreground">{done} of {tasks.length} done</span>
            <span className="font-extrabold tabular-nums">{team.progress}%</span>
          </div>
          <Progress value={team.progress} label={`${team.name} progress`} className="h-1.5" />
        </div>
        <MembersButton team={team} />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="hidden lg:inline-flex" onClick={() => setFilesOpen(true)} aria-label={`Files${fileCount ? `, ${fileCount}` : ""}`}>
            <FolderOpen aria-hidden /> <span className="hidden xl:inline">Files</span>
            {fileCount > 0 && <span className="rounded-full bg-muted px-1.5 text-xs font-bold tabular-nums text-muted-foreground">{fileCount}</span>}
          </Button>
          <AiSuggestionsButton />
          <Button onClick={() => openTask(null)}><Plus weight="bold" aria-hidden /> <span className="hidden sm:inline">New task</span><span className="sm:hidden">New</span></Button>
          <Tooltip label={dockOpen ? "Hide chat" : "Show chat"}>
            <Button variant={dockOpen ? "secondary" : "outline"} size="icon" className="hidden lg:inline-flex" aria-pressed={dockOpen} aria-label="Team chat panel"
              onClick={() => (dockOpen ? closeDock() : setDockPref(true))}>
              <SidebarSimple className="size-5 -scale-x-100" />
            </Button>
          </Tooltip>
        </div>
      </header>

      {/* Phone/tablet: one pane at a time */}
      <div className="shrink-0 px-4 pt-3 lg:hidden">
        <Segmented label="Workspace section" value={view} onChange={setView} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[
          { value: "board", label: <><Kanban aria-hidden className="size-4" />Board</> },
          { value: "chat", label: <><ChatsCircle aria-hidden className="size-4" />Chat{suggestions > 0 && <span className="size-1.5 rounded-full bg-warm" aria-hidden />}</> },
          { value: "files", label: <><FolderOpen aria-hidden className="size-4" />Files</> },
        ]} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Board */}
        <section aria-label="Task board" className={cn("min-w-0 flex-1 flex-col gap-4 p-4 lg:flex lg:p-6", view === "board" ? "flex" : "hidden")}>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Show tasks" value={scope} onChange={setScope} options={[{ value: "all", label: "Everyone" }, { value: "mine", label: "Mine" }]} />
            <div className="relative w-full max-w-60">
              <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tasks…" aria-label="Filter tasks" className="h-9 pl-10 md:h-9" />
            </div>
            {(scope !== "all" || q) && <p className="text-sm text-muted-foreground" role="status">{shown} of {tasks.length}</p>}
            <div className="ml-auto hidden min-w-0 md:block"><FocusStrip onOpen={openTask} /></div>
          </div>
          <div className="min-h-0 flex-1">
            <TaskBoard scope={scope} query={query} onEdit={openTask} />
          </div>
        </section>

        {/* Chat dock */}
        <AnimatePresence initial={false}>
          {dockOpen && (
            <motion.aside
              key="dock"
              aria-label="Team chat"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "min-h-0 w-full shrink-0 flex-col border-l bg-card lg:w-[23rem] xl:w-[26rem]",
                view === "chat" ? "flex" : "hidden",
                dockOpen ? "lg:flex" : "lg:hidden",
              )}
            >
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <ChatsCircle weight="duotone" className="size-5 text-primary" aria-hidden />
                <p className="text-sm font-extrabold">Team chat</p>
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success" /><span className="relative size-2 rounded-full bg-success" /></span>
                  live
                </span>
                <Tooltip label="Hide chat">
                  <Button variant="ghost" size="icon-sm" className="ml-auto hidden lg:inline-flex" onClick={closeDock} aria-label="Hide chat">
                    <SidebarSimple className="size-4 -scale-x-100" />
                  </Button>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1">
                <ChatThread key={team.id} team={team} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Files on phones; on desktop they open in a drawer */}
        <section aria-label="Files" className={cn("min-w-0 flex-1 overflow-y-auto p-4 lg:hidden", view === "files" ? "block" : "hidden")}>
          <FilesView team={team} />
        </section>
      </div>

      <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
        <SheetContent side="right">
          <div className="border-b p-5 pr-14">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold"><FolderOpen weight="duotone" className="size-5 text-primary" aria-hidden />Files</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Everything your team has shared, in one place.</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-thin"><FilesView team={team} /></div>
        </SheetContent>
      </Dialog>

      <TaskDialog open={dialogOpen || wantsNew} onOpenChange={closeDialog} task={wantsNew && !dialogOpen ? null : editing} team={team} />
    </div>
  );
}
