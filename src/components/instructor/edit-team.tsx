"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowsLeftRight, MagnifyingGlass, PencilSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { deleteTeam, getCourseRoster, updateTeam, type RosterStudent } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** Rename a team, change its description, and pick its members from everyone enrolled in the course. */
function EditTeamForm({ team, onDone }: { team: Team; onDone: () => void }) {
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const selectedId = useAppStore((s) => s.selectedTeam?.id);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const router = useRouter();
  const pathname = usePathname();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [name, setName] = React.useState(team.name);
  const [description, setDescription] = React.useState(team.description);
  const [members, setMembers] = React.useState(() => new Set(team.members.map((m) => m.userId)));
  const [roster, setRoster] = React.useState<RosterStudent[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getCourseRoster(team.courseId).then(setRoster, (err) => {
      console.error("Loading roster failed:", err);
      setRoster([]);
      setError("Could not load the course's students.");
    });
  }, [team.courseId]);

  const toggle = (id: string) => setMembers((m) => {
    const next = new Set(m);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // This team's members first, then everyone else by name. Sorted by who was on the team at open, not by
  // current ticks, so a row never jumps away from the cursor when clicked.
  const q = query.trim().toLowerCase();
  const list = (roster ?? [])
    .filter((st) => !q || `${st.name} ${st.skills.join(" ")} ${st.teamName ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.teamId === team.id) - Number(a.teamId === team.id));
  const moving = (roster ?? []).filter((st) => members.has(st.id) && st.teamId && st.teamId !== team.id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the team a name.");
    if (!members.size) return setError("A team needs at least one member.");
    setSaving(true);
    setError(null);
    try {
      await updateTeam(team.id, { name, description, memberIds: [...members] });
      await fetchTeams();
      toast.success(`${name.trim()} updated`, { description: moving.length ? `${moving.length} ${moving.length === 1 ? "student" : "students"} moved from another team.` : undefined });
      onDone();
    } catch (err) {
      console.error("Update team failed:", err);
      setError(err instanceof Error && /duplicate|unique/i.test(err.message) ? "Another team in this course already has that name." : "Could not save the team. Please try again.");
    }
    setSaving(false);
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteTeam(team.id);
      if (selectedId === team.id) setSelectedTeam(null);
      await fetchTeams();
      router.replace(pathname, { scroll: false }); // drop a ?team= that pointed at it
      toast.success(`${team.name} deleted`, { description: "Its students are back to “no team” and can be matched again." });
      onDone();
    } catch (err) {
      console.error("Delete team failed:", err);
      setError("Could not delete the team. Nothing was removed; please try again.");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Field label="Team name" htmlFor="team-name">
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-invalid={!name.trim() || undefined} />
      </Field>
      <Field label="Project or description" htmlFor="team-description" optional>
        <Textarea id="team-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className="min-h-16" placeholder="What this team is building…" />
      </Field>

      <fieldset className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <legend className="text-sm font-semibold">Members</legend>
          <span className="text-xs font-semibold text-muted-foreground">{members.size} selected</span>
        </div>
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students, skills or teams" aria-label="Search students" className="h-9 pl-10 md:h-9" />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-2xl border scroll-thin">
          {roster === null ? (
            <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
          ) : list.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{roster.length ? "No student matches." : "No students are enrolled in this course."}</p>
          ) : (
            <ul className="divide-y">
              {list.map((st) => {
                const checked = members.has(st.id);
                const elsewhere = st.teamId && st.teamId !== team.id;
                return (
                  <li key={st.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60", checked && "bg-primary/[0.04]")}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(st.id)} className="size-4 shrink-0 accent-[var(--primary)]" />
                      <Avatar name={st.name} id={st.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{st.name}</span>
                        {st.skills.length > 0 && <span className="block truncate text-xs text-muted-foreground">{st.skills.slice(0, 3).join(" · ")}</span>}
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                        st.teamId === team.id ? "bg-secondary text-secondary-foreground"
                          : elsewhere ? (checked ? "bg-warm/15 text-warm-text" : "bg-muted text-muted-foreground")
                            : "bg-success/12 text-success")}>
                        {st.teamId === team.id ? "This team" : elsewhere ? (checked ? `Moves from ${st.teamName}` : st.teamName) : "No team"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {moving.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-warm-text">
            <ArrowsLeftRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {moving.map((m) => m.name).join(", ")} will leave {moving.length === 1 ? "their current team" : "their current teams"}. A student is on one team per course.
          </p>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" loading={deleting} disabled={saving} onClick={() => setConfirmDelete(true)}>
          {!deleting && <Trash aria-hidden />} Delete team
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={roster === null || deleting}>{!saving && <PencilSimple aria-hidden />} Save changes</Button>
        </div>
      </DialogFooter>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${team.name}?`} confirmLabel="Delete team"
        description={`This permanently deletes the team's tasks, chat, files and peer reviews. Its ${team.members.length} ${team.members.length === 1 ? "student stays" : "students stay"} enrolled in ${team.courseCode} without a team, ready to be matched again. This can't be undone.`}
        onConfirm={remove} />
    </form>
  );
}

export function EditTeamButton({ team }: { team: Team }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><PencilSimple aria-hidden /> Edit team</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit {team.name}</DialogTitle>
            <DialogDescription>{team.courseCode} · Members keep their tasks, chat and files; removed students lose access to them.</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so it always starts from the team's current data. */}
          {open && <EditTeamForm team={team} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
