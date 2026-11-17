"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen, Books, ChalkboardTeacher, DotsThree, MagnifyingGlass, PencilSimple, Plus, SignIn, SignOut, Sparkle, Student, Trash, UserPlus, UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { createCourse, deleteCourse, updateCourse, getCourses, joinCourse, leaveCourse } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
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

// Each course gets a stable accent from its code, so cards are easy to tell apart at a glance.
const accents = ["var(--primary)", "var(--warm)", "var(--info)", "var(--success)"];
export const accentOf = (code: string) => accents[[...code].reduce((n, ch) => n + ch.charCodeAt(0), 0) % accents.length];

function defaultTerm() {
  const d = new Date();
  return `${d.getMonth() < 5 ? "Spring" : d.getMonth() < 8 ? "Summer" : "Fall"} ${d.getFullYear()}`;
}

function CourseCard({ course, role, busy, onJoin, onLeave, onEdit, onDelete }: {
  course: Course; role: string; busy: boolean; onJoin: () => void; onLeave: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const accent = accentOf(course.code);
  const instructor = role === "instructor";
  return (
    <Card interactive className="group relative flex h-full flex-col overflow-hidden">
      <div className="relative h-24 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 50%, black))` }}>
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-20" aria-hidden />
        <BookOpen weight="duotone" className="absolute -bottom-4 -right-3 size-24 text-white/15 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" aria-hidden />
        <div className="relative flex items-start justify-between gap-2 p-4">
          <span className="rounded-lg bg-black/25 px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-white backdrop-blur-sm">{course.code}</span>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">{course.term}</span>
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
                <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-2 -mt-1" aria-label={`Options for ${course.code}`}><DotsThree weight="bold" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}><PencilSimple aria-hidden /> Edit course</DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={onDelete}><Trash aria-hidden /> Delete course</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ChalkboardTeacher className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{course.isMine ? "You teach this course" : course.instructorName}</span>
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold text-muted-foreground">Students</dt>
            <dd className="text-lg font-extrabold tabular-nums">{course.studentCount}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{instructor ? "Teams" : "Your team"}</dt>
            <dd className="truncate text-lg font-extrabold tabular-nums">{instructor ? course.teamCount : course.myTeam ?? "—"}</dd>
          </div>
        </dl>

        <div className="relative z-10 mt-auto pt-5">
          {instructor ? (
            <>
              <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
                {course.students.length ? <AvatarStack names={course.students} max={5} /> : <span className="text-xs text-muted-foreground">No students yet</span>}
                {course.unplaced > 0 && <Badge variant="warm">{course.unplaced} without a team</Badge>}
              </div>
              {course.unplaced >= 2 ? (
                <Button asChild variant="warm" className="w-full">
                  <Link href={`/instructor/matching?course=${course.id}`}><Sparkle weight="fill" aria-hidden /> Match teams with AI</Link>
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  <Sparkle aria-hidden /> {course.studentCount ? "Everyone has a team" : "Waiting for students"}
                </Button>
              )}
            </>
          ) : course.enrolled ? (
            <div className="flex items-center justify-between gap-2">
              {course.myTeam ? <Badge variant="success"><UsersThree weight="fill" aria-hidden />On a team</Badge> : <Badge variant="muted">Awaiting team matching</Badge>}
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={onLeave}>
                <SignOut aria-hidden /> Leave
              </Button>
            </div>
          ) : (
            <Button className="w-full" loading={busy} onClick={onJoin}>{!busy && <SignIn aria-hidden />} Join course</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Creates a course, or edits `course` when given. Remount it (key) per course so the form starts from that course. */
export function CourseDialog({ course, open, onOpenChange, onSaved }: { course?: Course; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const blank = { code: "", title: "", term: defaultTerm(), description: "", goals: "", rationale: "" };
  const [form, setForm] = React.useState(course ? { code: course.code, title: course.title, term: course.term, description: course.description, goals: course.goals, rationale: course.rationale } : blank);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.code.trim().length < 2 || form.title.trim().length < 3 || form.term.trim().length < 3) return setError("Fill in a code, title and term.");
    setSaving(true);
    setError(null);
    try {
      const code = form.code.trim().toUpperCase();
      if (course) {
        await updateCourse(course.id, form);
        toast.success(`${code} updated`);
      } else {
        await createCourse(form);
        toast.success(`${code} created`, { description: "Students can now find and join it from their dashboard." });
        setForm(blank);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Save course failed:", err);
      setError(err instanceof Error && /duplicate|unique/i.test(err.message) ? "A course with this code already exists for this term." : `Could not ${course ? "save" : "create"} the course. Please try again.`);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{course ? `Edit ${course.code}` : "New course"}</DialogTitle>
          <DialogDescription>{course ? "Enrolled students and teams stay as they are." : "Students join it from their dashboard. Then let AI match them into teams."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <Field label="Code" htmlFor="course-code"><Input id="course-code" value={form.code} onChange={set("code")} placeholder="CSE-3200" maxLength={20} className="font-mono uppercase" autoFocus /></Field>
            <Field label="Term" htmlFor="course-term"><Input id="course-term" value={form.term} onChange={set("term")} maxLength={40} /></Field>
          </div>
          <Field label="Title" htmlFor="course-title" error={error}>
            <Input id="course-title" value={form.title} onChange={set("title")} placeholder="Software Engineering Project" maxLength={120} aria-invalid={!!error || undefined} />
          </Field>
          <Field label="What is this course?" htmlFor="course-description" optional hint="Shown at the top of the course page.">
            <Textarea id="course-description" value={form.description} onChange={set("description")} maxLength={4000} rows={3} placeholder="A hands-on introduction to…" />
          </Field>
          <Field label="Goals" htmlFor="course-goals" optional hint="One goal per line; each becomes a checklist item.">
            <Textarea id="course-goals" value={form.goals} onChange={set("goals")} maxLength={4000} rows={4} placeholder={"Build a working project as a team\nPresent it at the end of term"} />
          </Field>
          <Field label="Why take this course?" htmlFor="course-rationale" optional>
            <Textarea id="course-rationale" value={form.rationale} onChange={set("rationale")} maxLength={4000} rows={3} placeholder="What students gain from it…" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{!saving && (course ? <PencilSimple aria-hidden /> : <Plus weight="bold" aria-hidden />)} {course ? "Save changes" : "Create course"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Pending = { kind: "leave" | "delete"; course: Course } | null;

export function CoursesDashboard() {
  const user = useUser();
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const instructor = user.role === "instructor";
  const [courses, setCourses] = React.useState<Course[] | null>(null);
  const [tab, setTab] = React.useState<"mine" | "browse">("mine");
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);

  const load = React.useCallback(() => getCourses().then(setCourses, (err) => {
    console.error("Loading courses failed:", err);
    toast.error("Could not load courses");
    setCourses((c) => c ?? []);
  }), []);
  React.useEffect(() => { load(); }, [load]);

  async function run(id: string, fn: () => Promise<void>, ok: string, fail: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await Promise.all([load(), fetchTeams()]);
    } catch (err) {
      console.error(fail, err);
      toast.error(fail);
    }
    setBusyId(null);
  }

  const join = (c: Course) => run(c.id, () => joinCourse(c.id), `Joined ${c.code}`, "Could not join the course");
  function confirmPending() {
    if (!pending) return;
    const { kind, course: c } = pending;
    if (kind === "leave") run(c.id, () => leaveCourse(c.id), `Left ${c.code}`, "Could not leave the course");
    else run(c.id, () => deleteCourse(c.id), `${c.code} deleted`, "Could not delete the course");
  }

  const list = courses ?? [];
  const mine = list.filter((c) => (instructor ? c.isMine : c.enrolled));
  const q = query.trim().toLowerCase();
  const shown = (instructor || tab === "mine" ? mine : list)
    .filter((c) => !q || `${c.code} ${c.title} ${c.term} ${c.instructorName}`.toLowerCase().includes(q));

  const stats = instructor
    ? [
        { icon: Books, label: "Courses", value: mine.length, tone: "primary" as const },
        { icon: Student, label: "Students", value: mine.reduce((n, c) => n + c.studentCount, 0), tone: "info" as const },
        { icon: UsersThree, label: "Teams", value: mine.reduce((n, c) => n + c.teamCount, 0), tone: "success" as const },
        { icon: UserPlus, label: "Need a team", value: mine.reduce((n, c) => n + c.unplaced, 0), tone: "warm" as const },
      ]
    : [
        { icon: Books, label: "Enrolled", value: mine.length, tone: "primary" as const },
        { icon: UsersThree, label: "On a team", value: mine.filter((c) => c.myTeam).length, tone: "success" as const },
        { icon: UserPlus, label: "Awaiting a team", value: mine.filter((c) => !c.myTeam).length, tone: "warm" as const },
        { icon: BookOpen, label: "Open to join", value: list.length - mine.length, tone: "info" as const },
      ];

  return (
    <Page>
      <PageHeader
        title="Course dashboard"
        description={instructor ? "Create courses, watch enrolment, and let AI match students into teams." : "Join the courses you take. Your instructor matches you into a team."}
      >
        {instructor && <Button onClick={() => setCreating(true)}><Plus weight="bold" aria-hidden /> New course</Button>}
      </PageHeader>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => <StaggerItem key={s.label}><StatCard compact {...s} /></StaggerItem>)}
      </Stagger>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {instructor ? (
          <h2 className="text-lg font-extrabold">Your courses</h2>
        ) : (
          <Segmented label="Which courses" value={tab} onChange={setTab}
            options={[{ value: "mine", label: <>My courses <span className="text-xs tabular-nums opacity-70">{mine.length}</span></> }, { value: "browse", label: "Browse all" }]} />
        )}
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code, title or term" aria-label="Search courses" className="pl-10" />
        </div>
      </div>

      {courses === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-3xl" />)}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={`${tab}-${shown.length ? "list" : "empty"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
            {shown.length ? (
              <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((c) => (
                  <StaggerItem key={c.id} className="h-full">
                    <CourseCard course={c} role={user.role} busy={busyId === c.id}
                      onJoin={() => join(c)} onLeave={() => setPending({ kind: "leave", course: c })} onEdit={() => setEditing(c)} onDelete={() => setPending({ kind: "delete", course: c })} />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <Card className={cn("border-dashed bg-transparent shadow-none")}>
                {q ? (
                  <EmptyState icon={MagnifyingGlass} title="No matching courses" description={`Nothing matches “${query.trim()}”. Try a course code or a different word.`}>
                    <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>
                  </EmptyState>
                ) : instructor ? (
                  <EmptyState icon={Books} title="No courses yet" description="Create your first course. Students join it from their dashboard, then AI matching builds balanced teams.">
                    <Button onClick={() => setCreating(true)}><Plus weight="bold" aria-hidden /> New course</Button>
                  </EmptyState>
                ) : tab === "mine" ? (
                  <EmptyState icon={Books} title="You haven't joined a course" description="Browse the courses on offer and join yours. Your instructor will match you into a team.">
                    <Button onClick={() => setTab("browse")}><MagnifyingGlass aria-hidden /> Browse courses</Button>
                  </EmptyState>
                ) : (
                  <EmptyState icon={Books} title="No courses on offer" description="Instructors haven't created any courses yet. Check back soon." />
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
        title={pending?.kind === "delete" ? `Delete ${pending.course.code}?` : `Leave ${pending?.course.code}?`}
        description={pending?.kind === "delete"
          ? "This deletes the course with its enrolments and every team in it, including their chat, tasks and files. This can't be undone."
          : pending?.course.myTeam
            ? `You'll also leave ${pending.course.myTeam} and lose access to its chat, tasks and files. You can rejoin the course later, but not the team.`
            : "You can join again any time."}
        confirmLabel={pending?.kind === "delete" ? "Delete course" : "Leave course"}
        onConfirm={confirmPending}
      />
    </Page>
  );
}
