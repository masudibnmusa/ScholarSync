"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Archive, ArrowCounterClockwise, ArrowLeft, ArrowRight, BookOpen, ChalkboardTeacher, ChartBar, CheckCircle, DotsThree, DownloadSimple, Info, Lightbulb, ListChecks, Lock, PencilSimple, SignIn, Sparkle, Target, UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { exportCourseReport, getCourses, joinCourse, setCourseArchived } from "@/app/actions";
import { downloadCsv } from "@/lib/utils";
import { useAppStore, useLive } from "@/lib/store";
import type { Course, Team } from "@/lib/types";
import { accentOf, CourseDialog } from "@/components/app/courses";
import { CourseStudents } from "@/components/app/course-students";
import { GradingPanel, MyGradeCard } from "@/components/app/grading";
import { InviteButton } from "@/components/app/invite";
import { Milestones } from "@/components/app/milestones";
import { Announcements } from "@/components/app/announcements";
import { EmptyState, Page, StatCard } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { HealthBadge } from "@/components/instructor/charts";
import { EditTeamButton, NewTeamButton } from "@/components/instructor/edit-team";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/** One block of the instructor's write-up. Empty: the instructor gets a prompt to fill it, students a short note. */
function InfoSection({ icon: I, title, text, list, canEdit, onEdit }: {
  icon: Icon; title: string; text: string; list?: boolean; canEdit: boolean; onEdit: () => void;
}) {
  const lines = text.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><I weight="duotone" className="size-[1.125rem]" aria-hidden /></span>
        {title}
      </h2>
      {!lines.length ? (
        canEdit ? (
          <button type="button" onClick={onEdit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <PencilSimple aria-hidden className="size-4" /> Add {title.toLowerCase()}
          </button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">The instructor hasn&apos;t added this yet.</p>
        )
      ) : list ? (
        <ul className="mt-4 space-y-2.5">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-relaxed"><CheckCircle weight="fill" className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-foreground/90">{text.trim()}</p>
      )}
    </Card>
  );
}

function TeamCard({ team, href, editable }: { team: Team; href: string; editable: boolean }) {
  return (
    <Card interactive className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-extrabold">{team.name}</h3>
        <HealthBadge score={team.healthScore} showScore={false} />
      </div>
      {team.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{team.description}</p>}
      <div className="mt-3 flex items-center gap-2.5">
        <Progress value={team.progress} label={`${team.name} progress`} className="h-1.5" />
        <span className="w-9 text-right text-xs font-bold tabular-nums">{team.progress}%</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 pt-1">
        <AvatarStack people={team.members.map((m) => ({ id: m.userId, name: m.name }))} max={4} />
        <div className="flex gap-1.5">
          {editable && <EditTeamButton team={team} />}
          <Button asChild size="sm" variant="outline"><Link href={href}><ListChecks aria-hidden /> Open tasks <ArrowRight aria-hidden /></Link></Button>
        </div>
      </div>
    </Card>
  );
}

export function CourseDetail({ id }: { id: string }) {
  const user = useUser();
  const instructor = user.role === "instructor";
  const allTeams = useAppStore((s) => s.teams);
  const teamsLoaded = useAppStore((s) => s.loaded.teams);
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const [course, setCourse] = React.useState<Course | null | undefined>(undefined);
  const [editing, setEditing] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [archiving, setArchiving] = React.useState<"archive" | "restore" | null>(null);

  async function setArchived(archived: boolean) {
    if (!course) return;
    try {
      await setCourseArchived(course.id, archived);
      toast.success(archived ? `${course.code} archived` : `${course.code} restored`, {
        description: archived ? "It's read-only now. Grading still works." : "Teams can work in it again.",
      });
      await Promise.all([load(), fetchTeams()]);
    } catch (err) {
      console.error("Archive failed:", err);
      toast.error(archived ? "Could not archive the course" : "Could not restore the course");
    }
  }

  async function exportReport() {
    if (!course) return;
    setExporting(true);
    try {
      const { filename, csv } = await exportCourseReport(course.id);
      downloadCsv(filename, csv);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Could not export the report");
    }
    setExporting(false);
  }

  // shortcut: loads every course to show one; add a getCourse(id) action if the catalog grows large.
  const load = React.useCallback(() => getCourses().then((cs) => setCourse(cs.find((c) => c.id === id) ?? null), (err) => {
    console.error("Loading course failed:", err);
    setCourse(null);
  }), [id]);
  // Team edits elsewhere on the page (new team, edit, delete) change the counts and roster: reload when they do.
  const teamsSignature = useAppStore((s) => s.teams.filter((t) => t.courseId === id).map((t) => `${t.id}:${t.name}:${t.members.map((m) => m.userId).join(",")}`).join("|"));
  const live = useLive("courses", "course_enrollments");
  React.useEffect(() => { load(); }, [load, teamsSignature, live]);

  async function join() {
    if (!course) return;
    setJoining(true);
    try {
      await joinCourse(course.id);
      toast.success(`Joined ${course.code}`);
      await Promise.all([load(), fetchTeams()]);
    } catch (err) {
      console.error("Join failed:", err);
      toast.error("Could not join the course", { description: err instanceof Error ? err.message : undefined });
    }
    setJoining(false);
  }

  const back = (
    <Link href={`/${user.role}/courses`} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" /> Course dashboard
    </Link>
  );

  if (course === undefined) {
    return (
      <Page>
        {back}
        <Skeleton className="h-52 rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
      </Page>
    );
  }
  if (course === null) {
    return (
      <Page>
        {back}
        <Card><EmptyState icon={BookOpen} title="Course not found" description="It may have been deleted, or the link is wrong.">
          <Button asChild><Link href={`/${user.role}/courses`}>Back to dashboard</Link></Button>
        </EmptyState></Card>
      </Page>
    );
  }

  const accent = accentOf(course.code);
  const canEdit = instructor && course.isMine;
  const archived = !!course.archivedAt;
  const canManage = canEdit && !archived; // people and teams; an archived course is read-only
  // RLS limits teams to what the viewer may see: all of them for the course's instructor, their own for a student.
  const teams = allTeams.filter((t) => t.courseId === course.id);
  const avgProgress = teams.length ? Math.round(teams.reduce((n, t) => n + t.progress, 0) / teams.length) : 0;

  return (
    <Page>
      {back}

      <motion.header
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-3xl p-6 text-foreground shadow-soft sm:p-8"
        style={{ background: accent }}
      >
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-25" aria-hidden />
        <BookOpen weight="duotone" className="pointer-events-none absolute -bottom-10 -right-6 size-56 text-foreground/[0.07]" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-glass-strong px-2.5 py-1 font-mono text-xs font-bold tracking-wide">{course.code}</span>
              <span className="rounded-full bg-glass px-2.5 py-0.5 text-xs font-semibold">{course.term}</span>
              {!instructor && course.enrolled && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">Enrolled</span>}
              {archived && <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-background"><Archive weight="fill" className="size-3" aria-hidden />Archived</span>}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{course.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/75">
              <ChalkboardTeacher className="size-4" aria-hidden /> {course.isMine ? "You teach this course" : `Taught by ${course.instructorName}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && course.joinCode && <InviteButton courseId={course.id} code={course.joinCode} courseCode={course.code} joiningOpen={course.joiningOpen} onChanged={load} />}
            {canEdit && <Button variant="secondary" loading={exporting} onClick={exportReport}>{!exporting && <DownloadSimple aria-hidden />} Export report</Button>}
            {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><PencilSimple aria-hidden /> Edit course</Button>}
            {canManage && course.unplaced >= 2 && (
              <Button asChild variant="warm"><Link href={`/instructor/matching?course=${course.id}`}><Sparkle weight="fill" aria-hidden /> Match teams with AI</Link></Button>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label={`More actions for ${course.code}`}><DotsThree weight="bold" aria-hidden /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {archived
                    ? <DropdownMenuItem onSelect={() => setArchiving("restore")}><ArrowCounterClockwise aria-hidden /> Restore course</DropdownMenuItem>
                    : <DropdownMenuItem onSelect={() => setArchiving("archive")}><Archive aria-hidden /> Archive course</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!instructor && course.enrolled && teams.length > 0 && (
              <Button asChild variant="secondary"><Link href={`/student/courses/${course.id}/contribution`}><ChartBar aria-hidden /> Your contribution</Link></Button>
            )}
            {!instructor && !course.enrolled && (course.joiningOpen && !archived
              ? <Button variant="secondary" loading={joining} onClick={join}>{!joining && <SignIn aria-hidden />} Join course</Button>
              : <span className="inline-flex items-center gap-1.5 rounded-xl bg-glass-strong px-3 py-2 text-sm font-semibold"><Lock aria-hidden className="size-4" />{archived ? "This course has ended" : "Not accepting new students"}</span>)}
          </div>
        </div>
      </motion.header>

      {archived && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed bg-muted/50 px-4 py-3 text-sm">
          <Lock weight="duotone" className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong>Archived on {new Date(course.archivedAt!).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.</strong>{" "}
            {canEdit ? "Teams can still read their work, but nobody can change it. Grading still works." : "You can still read your team's work, but it can't be changed."}
          </p>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setArchiving("restore")}><ArrowCounterClockwise aria-hidden /> Restore</Button>}
        </div>
      )}

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StaggerItem><StatCard compact icon={UsersThree} label="Students" value={course.studentCount} tone="info" /></StaggerItem>
        <StaggerItem><StatCard compact icon={UsersThree} label="Teams" value={course.teamCount} tone="success" /></StaggerItem>
        <StaggerItem><StatCard compact icon={Target} label={instructor ? "Avg progress" : "Your team's progress"} value={avgProgress} suffix="%" tone="primary" /></StaggerItem>
        <StaggerItem>
          {instructor
            ? <StatCard compact icon={Sparkle} label="Need a team" value={course.unplaced} tone="warm" />
            : <StatCard compact icon={CheckCircle} label="Goals" value={course.goals.split("\n").filter((l) => l.trim()).length} tone="warm" />}
        </StaggerItem>
      </Stagger>

      {(canEdit || (!instructor && course.enrolled)) && <Announcements courseId={course.id} canPost={canEdit} />}
      {(canEdit || (!instructor && course.enrolled)) && <Milestones courseId={course.id} teams={teams} instructor={instructor} canEdit={canEdit} readOnly={archived} />}
      {canEdit && <GradingPanel courseId={course.id} />}
      {!instructor && course.enrolled && <MyGradeCard courseId={course.id} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <InfoSection icon={Info} title="About this course" text={course.description} canEdit={canEdit} onEdit={() => setEditing(true)} />
          <InfoSection icon={Target} title="Goals" text={course.goals} list canEdit={canEdit} onEdit={() => setEditing(true)} />
          <InfoSection icon={Lightbulb} title="Why this course" text={course.rationale} canEdit={canEdit} onEdit={() => setEditing(true)} />
        </div>

        <section aria-labelledby="teams-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="teams-title" className="text-lg font-extrabold">{instructor ? "Teams" : "Your team"}</h2>
              {teams.length > 0 && <Badge variant="muted">{teams.length}</Badge>}
            </div>
            {canManage && <NewTeamButton courseId={course.id} courseCode={course.code} />}
          </div>
          {!teamsLoaded ? (
            <Skeleton className="h-40 rounded-3xl" />
          ) : teams.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {teams.map((t) => <TeamCard key={t.id} team={t} editable={canManage} href={`/${user.role}/courses/${course.id}/teams/${t.id}`} />)}
            </div>
          ) : (
            <Card className="border-dashed bg-transparent shadow-none">
              <EmptyState icon={UsersThree} title="No teams yet"
                description={instructor
                  ? course.unplaced >= 2 ? "Let AI group the enrolled students into balanced teams." : "Teams appear here once students join and are matched."
                  : course.enrolled ? "Your instructor hasn't matched you into a team yet." : "Join the course to be matched into a team."}>
                {canManage && course.unplaced >= 2 && <Button asChild variant="warm"><Link href={`/instructor/matching?course=${course.id}`}><Sparkle weight="fill" aria-hidden /> Match teams</Link></Button>}
              </EmptyState>
            </Card>
          )}
        </section>
      </div>

      {canEdit && <CourseStudents course={course} readOnly={archived} onChanged={() => { load(); fetchTeams(); }} />}

      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} destructive={archiving === "archive"}
        title={archiving === "archive" ? `Archive ${course.code}?` : `Restore ${course.code}?`}
        confirmLabel={archiving === "archive" ? "Archive course" : "Restore course"}
        description={archiving === "archive"
          ? "Use this when the term is over. Everything becomes read-only: teams keep access to their tasks, chat and files but can't change them, nobody can join, and you can't change students or teams. Grading still works. You can restore it any time."
          : "Teams can work in it again, and you can manage students and teams."}
        onConfirm={() => { if (archiving) setArchived(archiving === "archive"); setArchiving(null); }} />

      {canEdit && <CourseDialog key={`${course.id}-${editing}`} course={course} open={editing} onOpenChange={setEditing} onSaved={load} />}
    </Page>
  );
}
