"use client";

import * as React from "react";
import { CheckCircle, Info, MagnifyingGlass, Trash, UserCirclePlus, UserPlus, Users, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { enrollStudents, getCourseRoster, removeStudent, type EnrollOutcome, type RosterStudent } from "@/app/actions";
import type { Course } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX = 200; // same cap as the database function

/** Splits pasted text (one per line, commas, spaces or a spreadsheet column) into unique addresses. */
function parseEmails(text: string) {
  const all = [...new Set(text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return { valid: all.filter((e) => EMAIL.test(e)), invalid: all.filter((e) => !EMAIL.test(e)) };
}

const groups: { outcome: EnrollOutcome["outcome"]; title: string; note?: string; tone: string; icon: typeof CheckCircle }[] = [
  { outcome: "added", title: "Added", tone: "text-success", icon: CheckCircle },
  { outcome: "already", title: "Already in the course", tone: "text-muted-foreground", icon: Info },
  { outcome: "no_account", title: "No account yet", note: "Send them the invite link; they join after signing up.", tone: "text-warm-text", icon: UserCirclePlus },
  { outcome: "not_student", title: "Not a student account", note: "Instructor accounts can't be enrolled.", tone: "text-destructive", icon: WarningCircle },
];

function AddStudentsDialog({ course, open, onOpenChange, onAdded }: { course: Course; open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<EnrollOutcome[] | null>(null);
  const { valid, invalid } = parseEmails(text);

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) { setText(""); setResults(null); setError(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid.length) return setError("Paste at least one email address.");
    if (invalid.length) return setError(`Fix or remove ${invalid.length === 1 ? "this entry" : "these entries"}: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}`);
    if (valid.length > MAX) return setError(`Add at most ${MAX} students at a time.`);
    setSaving(true);
    setError(null);
    try {
      const out = await enrollStudents(course.id, valid);
      setResults(out);
      if (out.some((r) => r.outcome === "added")) onAdded();
    } catch (err) {
      console.error("Enroll by email failed:", err);
      setError("Could not add the students. Please try again.");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add students to {course.code}</DialogTitle>
          <DialogDescription>Paste their university emails. Students who already have an account are enrolled right away.</DialogDescription>
        </DialogHeader>
        {results ? (
          <div className="space-y-4" role="status">
            {groups.map((g) => {
              const list = results.filter((r) => r.outcome === g.outcome);
              if (!list.length) return null;
              return (
                <section key={g.outcome}>
                  <h3 className={`flex items-center gap-1.5 text-sm font-bold ${g.tone}`}><g.icon weight="fill" className="size-4" aria-hidden />{g.title} <span className="font-semibold text-muted-foreground">{list.length}</span></h3>
                  {g.note && <p className="mt-0.5 text-xs text-muted-foreground">{g.note}</p>}
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((r) => <li key={r.email} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{r.email}</li>)}
                  </ul>
                </section>
              );
            })}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResults(null)}>Add more</Button>
              <Button type="button" onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email addresses" htmlFor="enroll-emails" error={error}
              hint={valid.length ? `${valid.length} ${valid.length === 1 ? "address" : "addresses"}${invalid.length ? `, ${invalid.length} not valid` : ""}` : "One per line, or separated by commas. A pasted spreadsheet column works too."}>
              <Textarea id="enroll-emails" value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={6} autoFocus
                placeholder={"sara@university.edu\nrahim@university.edu"} aria-invalid={!!error || undefined} className="font-mono text-sm" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" loading={saving} disabled={!valid.length}>{!saving && <UserPlus aria-hidden />} Add {valid.length || ""} {valid.length === 1 ? "student" : "students"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Instructor: everyone enrolled, with their team; add by email or remove. Read-only when the course is archived. */
export function CourseStudents({ course, readOnly, onChanged }: { course: Course; readOnly: boolean; onChanged: () => void }) {
  const [roster, setRoster] = React.useState<RosterStudent[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<RosterStudent | null>(null);

  const load = React.useCallback(() => getCourseRoster(course.id).then(setRoster, (err) => {
    console.error("Loading roster failed:", err);
    toast.error("Could not load the students");
    setRoster((r) => r ?? []);
  }), [course.id]);
  const live = useLive("course_enrollments", "team_members", "teams", "users");
  React.useEffect(() => { load(); }, [load, course, live]); // the page reloads `course` after any student or team change

  async function remove(st: RosterStudent) {
    try {
      await removeStudent(course.id, st.id);
      toast.success(`${st.name} removed from ${course.code}`, { description: st.teamName ? `They also left ${st.teamName}.` : undefined });
      await load();
      onChanged();
    } catch (err) {
      console.error("Remove student failed:", err);
      toast.error("Could not remove the student");
    }
  }

  const q = query.trim().toLowerCase();
  const list = (roster ?? []).filter((st) => !q || `${st.name} ${st.email} ${st.teamName ?? ""}`.toLowerCase().includes(q));

  return (
    <section aria-labelledby="students-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="students-title" className="text-lg font-extrabold">Students</h2>
          {roster && <Badge variant="muted">{roster.length}</Badge>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {roster && roster.length > 0 && (
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or team" aria-label="Search students" className="h-9 pl-10 md:h-9" />
            </div>
          )}
          {!readOnly && <Button size="sm" onClick={() => setAdding(true)}><UserPlus aria-hidden /> Add students</Button>}
        </div>
      </div>

      <Card className="overflow-hidden">
        {roster === null ? (
          <div className="space-y-2 p-4" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : roster.length === 0 ? (
          <EmptyState icon={Users} title="No students yet" description={readOnly ? "Nobody was enrolled when the course was archived." : "Add students by email, or share the invite link so they can join."}>
            {!readOnly && <Button onClick={() => setAdding(true)}><UserPlus aria-hidden /> Add students</Button>}
          </EmptyState>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No student matches “{query.trim()}”.</p>
        ) : (
          <ul className="max-h-[28rem] divide-y overflow-y-auto scroll-thin" aria-label={`Students in ${course.code}`}>
            {list.map((st) => (
              <li key={st.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={st.name} id={st.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{st.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{st.email}</p>
                </div>
                {st.teamName ? <Badge className="hidden sm:inline-flex">{st.teamName}</Badge> : <Badge variant="warm" className="hidden sm:inline-flex">No team</Badge>}
                {!readOnly && (
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${st.name} from ${course.code}`} onClick={() => setRemoving(st)}>
                    <Trash aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!readOnly && <AddStudentsDialog course={course} open={adding} onOpenChange={setAdding} onAdded={() => { load(); onChanged(); }} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name} from ${course.code}?`} confirmLabel="Remove student"
        description={removing?.teamName
          ? `They also leave ${removing.teamName} and lose access to its chat, tasks and files. Their past work stays with the team. You can add them back later, but not onto the team automatically.`
          : "They lose access to the course. You can add them back later."}
        onConfirm={() => { if (removing) remove(removing); setRemoving(null); }} />
    </section>
  );
}
