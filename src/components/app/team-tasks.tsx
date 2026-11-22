"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import type { KanbanTask } from "@/lib/types";
import { EmptyState, Page } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { HealthBadge } from "@/components/instructor/charts";
import { TaskBoard, TaskDialog } from "@/components/student/kanban";
import { MembersButton } from "@/components/student/shared";
import { TeamReviews } from "@/components/app/team-reviews";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { num } from "@/lib/i18n";

/** One team's task board, opened from its course page. Instructors read it; members can add and edit tasks. */
export function TeamTasks({ courseId, teamId }: { courseId: string; teamId: string }) {
  const { t } = useT();
  const user = useUser();
  const instructor = user.role === "instructor";
  const loaded = useAppStore((s) => s.loaded.teams);
  const team = useAppStore((s) => s.teams.find((tt) => tt.id === teamId && tt.courseId === courseId)) ?? null;
  const selectedId = useAppStore((s) => s.selectedTeam?.id);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const [editing, setEditing] = React.useState<KanbanTask | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // TaskBoard shows the selected team's tasks, so select this one (that also loads its tasks and live updates).
  React.useEffect(() => {
    if (team && selectedId !== team.id) setSelectedTeam(team);
  }, [team, selectedId, setSelectedTeam]);

  const courseHref = `/${user.role}/courses/${courseId}`;
  const back = (
    <Link href={courseHref} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" /> {t("Back to course")}
    </Link>
  );

  if (!loaded) return <Page>{back}<Skeleton className="h-16 rounded-3xl" /><Skeleton className="h-80 rounded-3xl" /></Page>;
  if (!team) {
    return (
      <Page>
        {back}
        <Card><EmptyState icon={ListChecks} title={t("Team not found")} description={t("It may have been removed, or you're not part of it.")}>
          <Button asChild><Link href={courseHref}>{t("Back to course")}</Link></Button>
        </EmptyState></Card>
      </Page>
    );
  }

  return (
    <Page>
      {back}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_16rem]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-extrabold sm:text-[1.75rem]">{team.name} {t("· Tasks")}</h1>
            <HealthBadge score={team.healthScore} />
          </div>
          {team.description && <p className="mt-1 text-sm text-muted-foreground">{team.description}</p>}
        </div>
        <div className="flex min-w-44 flex-1 flex-col gap-1 sm:flex-none">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold text-muted-foreground">{num(team._count?.tasks ?? 0)} {team._count?.tasks === 1 ? t("task") : t("tasks")}</span>
            <span className="font-extrabold tabular-nums">{num(team.progress)}%</span>
          </div>
          <Progress value={team.progress} label={t("{name} progress", { name: team.name })} className="h-1.5" />
        </div>
        <MembersButton team={team} align="end" />
      </header>

      {/* Wait for the switch to this team so another team's tasks never flash here. */}
      {selectedId === team.id
        ? <TaskBoard readOnly={instructor} onEdit={instructor ? undefined : (tt) => { setEditing(tt); setDialogOpen(true); }} />
        : <Skeleton className="h-80 rounded-3xl" />}
      {instructor && <TeamReviews teamId={team.id} />}
      {!instructor && <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editing} team={team} />}
    </Page>
  );
}
