"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive, ArrowCounterClockwise, BookOpen, Books, ChalkboardTeacher, DotsThree, Lock, MagnifyingGlass, PencilSimple, Plus, SignIn, SignOut, Sparkle, Student, Trash, UserPlus, UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { createCourse, deleteCourse, updateCourse, getCourses, joinCourse, leaveCourse, setCourseArchived } from "@/app/actions";
import { useAppStore, useLive } from "@/lib/store";
import { cn, firstName } from "@/lib/utils";
import { useClientValue } from "@/hooks/use-client";
import type { Course } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { JoinWithCodeButton } from "@/components/app/invite";
import { EmptyState, Page, PageHeader, StatCard } from "@/components/app/page";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EASE, Stagger, StaggerItem } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import {intl, t, num } from "@/lib/i18n";

// Each course gets a stable accent from its code, so cards are easy to tell apart at a glance.
const accents = ["var(--peach)", "var(--sage)", "var(--butter)", "var(--sky)"];
export const accentOf = (code: string) => accents[[...code].reduce((n, ch) => n + ch.charCodeAt(0), 0) % accents.length];

function defaultTerm() {
  const d = new Date();
  return `${d.getMonth() < 5 ? t("Spring") : d.getMonth() < 8 ? t("Summer") : t("Fall")} ${d.getFullYear()}`;
}

function CourseCard({ course, role, busy, onJoin, onLeave, onEdit, onDelete, onArchive }: {
  course: Course; role: string; busy: boolean; onJoin: () => void; onLeave: () => void; onEdit: () => void; onDelete: () => void; onArchive: () => void;
}) {
  const { t } = useT();
  const accent = accentOf(course.code);
  const instructor = role === "instructor";
  const archived = !!course.archivedAt;
  return (
    <Card interactive className="group relative flex h-full flex-col overflow-hidden">
      <div className="relative h-24 overflow-hidden" style={{ background: accent }}>
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-30" aria-hidden />
        <BookOpen weight="duotone" className="absolute -bottom-4 -right-3 size-24 text-foreground/10 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" aria-hidden />
        <div className="relative flex items-start justify-between gap-2 p-4">
          <span className="rounded-lg bg-glass-strong px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-foreground">{course.code}</span>
          <span className="flex flex-wrap justify-end gap-1">
            {archived && <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-[0.6875rem] font-bold text-background"><Archive weight="fill" className="size-3" aria-hidden />{t("Archived")}</span>}
            <span className="rounded-full bg-glass px-2.5 py-0.5 text-[0.6875rem] font-semibold text-foreground">{course.term}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 pt-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-base font-extrabold leading-snug">
            <Link href={`/${role}/courses/${course.id}`} className="rounded outline-none after:absolute after:inset-0 after:rounded-[inherit] hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40">{course.title}</Link>
          </h3>
          {instructor && course.isMine && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-2 -mt-1" aria-label={t("Options for {code}", { code: course.code })}><DotsThree weight="bold" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}><PencilSimple aria-hidden /> {t("Edit course")}</DropdownMenuItem>
                {archived
                  ? <DropdownMenuItem onSelect={onArchive}><ArrowCounterClockwise aria-hidden /> {t("Restore course")}</DropdownMenuItem>
                  : <DropdownMenuItem onSelect={onArchive}><Archive aria-hidden /> {t("Archive course")}</DropdownMenuItem>}
                <DropdownMenuItem destructive onSelect={onDelete}><Trash aria-hidden /> {t("Delete course")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ChalkboardTeacher className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{course.isMine ? t("You teach this course") : course.instructorName}</span>
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{t("Students")}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{num(course.studentCount)}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{instructor ? t("Teams") : t("Your team")}</dt>
            <dd className="truncate text-lg font-extrabold tabular-nums">{instructor ? course.teamCount : course.myTeam ?? "—"}</dd>
          </div>
        </dl>

        <div className="relative z-10 mt-auto pt-5">
          {instructor ? (
            <>
              <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
                {course.students.length ? <AvatarStack people={course.students} max={5} /> : <span className="text-xs text-muted-foreground">{t("No students yet")}</span>}
                {course.unplaced > 0 && <Badge variant="warm">{num(course.unplaced)} {t("without a team")}</Badge>}
              </div>
              {archived ? (
                <Button variant="outline" className="w-full" disabled><Lock aria-hidden /> {t("Archived, read-only")}</Button>
              ) : course.unplaced >= 2 ? (
                <Button asChild variant="warm" className="w-full">
                  <Link href={`/instructor/matching?course=${course.id}`}><Sparkle weight="fill" aria-hidden /> {t("Match teams with AI")}</Link>
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  <Sparkle aria-hidden /> {course.studentCount ? t("Everyone has a team") : t("Waiting for students")}
                </Button>
              )}
            </>
          ) : course.enrolled ? (
            <div className="flex items-center justify-between gap-2">
              {course.myTeam ? <Badge variant="success"><UsersThree weight="fill" aria-hidden />{t("On a team")}</Badge> : <Badge variant="muted">{t("Awaiting team matching")}</Badge>}
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={onLeave}>
                <SignOut aria-hidden /> {t("Leave")}
              </Button>
            </div>
          ) : archived || !course.joiningOpen ? (
            <Button variant="outline" className="w-full" disabled><Lock aria-hidden /> {archived ? t("Course has ended") : t("Not accepting students")}</Button>
          ) : (
            <Button className="w-full" loading={busy} onClick={onJoin}>{!busy && <SignIn aria-hidden />} {t("Join course")}</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Creates a course, or edits `course` when given. Remount it (key) per course so the form starts from that course. */
export function CourseDialog({ course, open, onOpenChange, onSaved }: { course?: Course; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { t } = useT();
  const blank = { code: "", title: "", term: defaultTerm(), description: "", goals: "", rationale: "" };
  const [form, setForm] = React.useState(course ? { code: course.code, title: course.title, term: course.term, description: course.description, goals: course.goals, rationale: course.rationale } : blank);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.code.trim().length < 2 || form.title.trim().length < 3 || form.term.trim().length < 3) return setError(t("Fill in a code, title and term."));
    setSaving(true);
    setError(null);
    try {
      const code = form.code.trim().toUpperCase();
      if (course) {
        await updateCourse(course.id, form);
        toast.success(`${code} updated`);
      } else {
        await createCourse(form);
        toast.success(`${code} created`, { description: t("Students can now find and join it from their dashboard.") });
        setForm(blank);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Save course failed:", err);
      setError(err instanceof Error && /duplicate|unique/i.test(err.message) ? t("A course with this code already exists for this term.") : (course ? t("Could not save the course. Please try again.") : t("Could not create the course. Please try again.")));
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{course ? t("Edit {code}", { code: course.code }) : t("New course")}</DialogTitle>
          <DialogDescription>{course ? t("Enrolled students and teams stay as they are.") : t("Students join it from their dashboard. Then let AI match them into teams.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <Field label={t("Code")} htmlFor="course-code"><Input id="course-code" value={form.code} onChange={set("code")} placeholder={t("CSE-3200")} maxLength={20} className="font-mono uppercase" autoFocus /></Field>
            <Field label={t("Term")} htmlFor="course-term"><Input id="course-term" value={form.term} onChange={set("term")} maxLength={40} /></Field>
          </div>
          <Field label={t("Title")} htmlFor="course-title" error={error}>
            <Input id="course-title" value={form.title} onChange={set("title")} placeholder={t("Software Engineering Project")} maxLength={120} aria-invalid={!!error || undefined} />
          </Field>
          <Field label={t("What is this course?")} htmlFor="course-description" optional hint={t("Shown at the top of the course page.")}>
            <Textarea id="course-description" value={form.description} onChange={set("description")} maxLength={4000} rows={3} placeholder={t("A hands-on introduction to…")} />
          </Field>
          <Field label={t("Goals")} htmlFor="course-goals" optional hint={t("One goal per line; each becomes a checklist item.")}>
            <Textarea id="course-goals" value={form.goals} onChange={set("goals")} maxLength={4000} rows={4} placeholder={t("Build a working project as a team\nPresent it at the end of term")} />
          </Field>
          <Field label={t("Why take this course?")} htmlFor="course-rationale" optional>
            <Textarea id="course-rationale" value={form.rationale} onChange={set("rationale")} maxLength={4000} rows={3} placeholder={t("What students gain from it…")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{!saving && (course ? <PencilSimple aria-hidden /> : <Plus weight="bold" aria-hidden />)} {course ? t("Save changes") : t("Create course")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Pending = { kind: "leave" | "delete" | "archive" | "restore"; course: Course } | null;


// Time of day and date come from the viewer's clock, so the server renders a neutral greeting first.
function partOfDay() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? t("Good morning") : h >= 12 && h < 18 ? t("Good afternoon") : t("Good evening");
}
const todayLabel = () => new Date().toLocaleDateString(intl(), { weekday: "long", day: "numeric", month: "long" });

export function CoursesDashboard() {
  const { t, tn } = useT();
  const user = useUser();
  const greeting = useClientValue(partOfDay, t("Welcome back"));
  const today = useClientValue(todayLabel, "");
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const instructor = user.role === "instructor";
  const [courses, setCourses] = React.useState<Course[] | null>(null);
  const [tab, setTab] = React.useState<"mine" | "browse">("mine");
  const [shelf, setShelf] = React.useState<"active" | "archived">("active"); // instructors
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);

  const load = React.useCallback(() => getCourses().then(setCourses, (err) => {
    console.error("Loading courses failed:", err);
    toast.error(t("Could not load courses"));
    setCourses((c) => c ?? []);
  }), []);
  const live = useLive("courses", "course_enrollments", "teams", "team_members");
  React.useEffect(() => { load(); }, [load, live]);

  async function run(id: string, fn: () => Promise<void>, ok: string, fail: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await Promise.all([load(), fetchTeams()]);
    } catch (err) {
      console.error(fail, err);
      toast.error(fail, { description: err instanceof Error ? t(err.message) : undefined });
    }
    setBusyId(null);
  }

  const join = (c: Course) => run(c.id, () => joinCourse(c.id), t("Joined {code}", { code: c.code }), t("Could not join the course"));
  function confirmPending() {
    if (!pending) return;
    const { kind, course: c } = pending;
    if (kind === "leave") run(c.id, () => leaveCourse(c.id), t("Left {code}", { code: c.code }), t("Could not leave the course"));
    else if (kind === "archive") run(c.id, () => setCourseArchived(c.id, true), t("{code} archived", { code: c.code }), t("Could not archive the course"));
    else if (kind === "restore") run(c.id, () => setCourseArchived(c.id, false), t("{code} restored", { code: c.code }), t("Could not restore the course"));
    else run(c.id, () => deleteCourse(c.id), t("{code} deleted", { code: c.code }), t("Could not delete the course"));
  }

  const list = courses ?? [];
  // Instructors keep archived courses on their own shelf; students see theirs under My courses, and the catalog only lists live ones.
  const allMine = list.filter((c) => (instructor ? c.isMine : c.enrolled));
  const archivedMine = instructor ? allMine.filter((c) => c.archivedAt) : [];
  const mine = instructor ? allMine.filter((c) => !c.archivedAt) : allMine;
  const q = query.trim().toLowerCase();
  const shown = (instructor ? (shelf === "archived" ? archivedMine : mine) : tab === "mine" ? mine : list.filter((c) => !c.archivedAt || c.enrolled))
    .filter((c) => !q || `${c.code} ${c.title} ${c.term} ${c.instructorName}`.toLowerCase().includes(q));

  const unplaced = mine.reduce((n, c) => n + c.unplaced, 0);
  const waiting = mine.filter((c) => !c.myTeam).length;
  const stats = instructor
    ? [
        { icon: Books, label: t("Courses"), value: mine.length, tone: "primary" as const },
        { icon: Student, label: t("Students"), value: mine.reduce((n, c) => n + c.studentCount, 0), tone: "info" as const },
        { icon: UsersThree, label: t("Teams"), value: mine.reduce((n, c) => n + c.teamCount, 0), tone: "success" as const },
        { icon: UserPlus, label: t("Need a team"), value: unplaced, tone: "warm" as const },
      ]
    : [
        { icon: Books, label: t("Enrolled"), value: mine.length, tone: "primary" as const },
        { icon: UsersThree, label: t("On a team"), value: mine.filter((c) => c.myTeam).length, tone: "success" as const },
        { icon: UserPlus, label: t("Awaiting a team"), value: waiting, tone: "warm" as const },
        { icon: BookOpen, label: t("Open to join"), value: list.filter((c) => !c.enrolled && c.joiningOpen && !c.archivedAt).length, tone: "info" as const },
      ];

  const summary = !courses ? "" : instructor
    ? t("{courses}, {rest}", { courses: tn(mine.length, "{n} course", "{n} courses"), rest: unplaced ? tn(unplaced, "{n} student still needs a team", "{n} students still need a team") : t("every student has a team") })
    : mine.length === 0 ? t("Join a course to get started")
    : t("{courses}, {rest}", { courses: tn(mine.length, "{n} course", "{n} courses"), rest: waiting ? t("{waiting} still waiting for a team", { waiting }) : t("on a team in each") });

  return (
    <Page>
      <PageHeader
        title={`${greeting}, ${firstName(user.name)}`}
        description={[today, summary].filter(Boolean).join(" · ") || "\u00a0"}
      >
        {instructor ? <Button onClick={() => setCreating(true)}><Plus weight="bold" aria-hidden /> {t("New course")}</Button> : <JoinWithCodeButton />}
      </PageHeader>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => <StaggerItem key={s.label}><StatCard compact {...s} /></StaggerItem>)}
      </Stagger>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {instructor ? (
          archivedMine.length ? (
            <Segmented label={t("Which courses")} value={shelf} onChange={setShelf}
              options={[{ value: "active", label: <>{t("Active")} <span className="text-xs tabular-nums opacity-70">{num(mine.length)}</span></> }, { value: "archived", label: <>{t("Archived")} <span className="text-xs tabular-nums opacity-70">{num(archivedMine.length)}</span></> }]} />
          ) : <h2 className="text-lg font-extrabold">{t("Your courses")}</h2>
        ) : (
          <Segmented label={t("Which courses")} value={tab} onChange={setTab}
            options={[{ value: "mine", label: <>{t("My courses")} <span className="text-xs tabular-nums opacity-70">{num(mine.length)}</span></> }, { value: "browse", label: t("Browse all") }]} />
        )}
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search by code, title or term")} aria-label={t("Search courses")} className="pl-10" />
        </div>
      </div>

      {courses === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-3xl" />)}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={`${tab}-${shelf}-${shown.length ? "list" : "empty"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
            {shown.length ? (
              <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((c) => (
                  <StaggerItem key={c.id} className="h-full">
                    <CourseCard course={c} role={user.role} busy={busyId === c.id}
                      onJoin={() => join(c)} onLeave={() => setPending({ kind: "leave", course: c })} onEdit={() => setEditing(c)} onDelete={() => setPending({ kind: "delete", course: c })}
                      onArchive={() => setPending({ kind: c.archivedAt ? "restore" : "archive", course: c })} />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <Card className={cn("border-dashed bg-transparent shadow-none")}>
                {q ? (
                  <EmptyState icon={MagnifyingGlass} title={t("No matching courses")} description={t("Nothing matches “{trim}”. Try a course code or a different word.", { trim: query.trim() })}>
                    <Button variant="outline" onClick={() => setQuery("")}>{t("Clear search")}</Button>
                  </EmptyState>
                ) : instructor && shelf === "archived" ? (
                  <EmptyState icon={Archive} title={t("No archived courses")} description={t("Archive a course from its menu when the term ends.")} />
                ) : instructor ? (
                  <EmptyState icon={Books} title={t("No courses yet")} description={t("Create your first course. Students join it from their dashboard, then AI matching builds balanced teams.")}>
                    <Button onClick={() => setCreating(true)}><Plus weight="bold" aria-hidden /> {t("New course")}</Button>
                  </EmptyState>
                ) : tab === "mine" ? (
                  <EmptyState icon={Books} title={t("You haven't joined a course")} description={t("Browse the courses on offer and join yours. Your instructor will match you into a team.")}>
                    <Button onClick={() => setTab("browse")}><MagnifyingGlass aria-hidden /> {t("Browse courses")}</Button>
                  </EmptyState>
                ) : (
                  <EmptyState icon={Books} title={t("No courses on offer")} description={t("Instructors haven't created any courses yet. Check back soon.")} />
                )}
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {instructor && <CourseDialog open={creating} onOpenChange={setCreating} onSaved={load} />}
      {editing && <CourseDialog key={editing.id} course={editing} open onOpenChange={(o) => !o && setEditing(null)} onSaved={load} />}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "delete" ? t("Delete {code}?", { code: pending.course.code }) : pending?.kind === "archive" ? t("Archive {code}?", { code: pending.course.code }) : pending?.kind === "restore" ? t("Restore {code}?", { code: pending.course.code }) : t("Leave {code}?", { code: pending?.course.code })}
        destructive={pending?.kind !== "restore"}
        description={pending?.kind === "delete"
          ? t("This deletes the course with its enrolments and every team in it, including their chat, tasks and files. This can't be undone.")
          : pending?.kind === "archive"
            ? t("Use this when the term is over. Everything becomes read-only: teams keep access to their work but can't change it, and nobody can join. Grading still works. You can restore it any time.")
          : pending?.kind === "restore"
            ? t("Teams can work in it again, and you can manage students and teams.")
          : pending?.course.myTeam
            ? t("You'll also leave {myTeam} and lose access to its chat, tasks and files. You can rejoin the course later, but not the team.", { myTeam: pending.course.myTeam })
            : t("You can join again any time.")}
        confirmLabel={pending?.kind === "delete" ? t("Delete course") : pending?.kind === "archive" ? t("Archive course") : pending?.kind === "restore" ? t("Restore course") : t("Leave course")}
        onConfirm={confirmPending}
      />
    </Page>
  );
}
