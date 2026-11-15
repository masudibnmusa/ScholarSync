"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarBlank, CaretDown, Check, CheckCircle, CircleDashed, DotsThree, Flag, ListChecks, PencilSimple, Plus, Spinner, Trash,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { cn, dueInfo, toneText } from "@/lib/utils";
import type { KanbanTask, Team } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Status = KanbanTask["status"];

// List order: work in flight first, then what's waiting, then what's finished.
const statuses: { id: Status; label: string; icon: Icon; pill: string; order: number }[] = [
  { id: "todo", label: "To do", icon: CircleDashed, pill: "bg-muted text-muted-foreground", order: 1 },
  { id: "in-progress", label: "In progress", icon: Spinner, pill: "bg-warm/15 text-warm-text", order: 0 },
  { id: "done", label: "Done", icon: CheckCircle, pill: "bg-success/12 text-success", order: 2 },
];
const statusOf = (id: Status) => statuses.find((x) => x.id === id)!;

const priorityBadge = { high: "danger", medium: "warning", low: "muted" } as const;
const UNASSIGNED = "none"; // Radix Select reserves the empty string

// ─── Task dialog (create + edit) ─────────────────────────────────────────

// The form mounts with the dialog content, so it always starts from the task being edited (or blank).
function TaskForm({ onClose, task, team }: { onClose: () => void; task: KanbanTask | null; team: Team }) {
  const createTask = useAppStore((s) => s.createTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const user = useUser();
  const [form, setForm] = React.useState(() => task
    ? { title: task.title, description: task.description, priority: task.priority, status: task.status, dueDate: task.dueDate ?? "", assigneeId: task.assigneeId ?? "" }
    : { title: "", description: "", priority: "medium" as KanbanTask["priority"], status: "todo" as Status, dueDate: "", assigneeId: user.id });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const onOpenChange = (open: boolean) => { if (!open) onClose(); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give the task a short title.");
      document.getElementById("task-title")?.focus();
      return;
    }
    setSaving(true);
    if (task) {
      await updateTask(task.id, { ...form, title: form.title.trim(), assigneeId: form.assigneeId || null, dueDate: form.dueDate || null });
      onOpenChange(false);
    } else if (await createTask(team.id, { title: form.title.trim(), description: form.description, priority: form.priority, dueDate: form.dueDate, assigneeId: form.assigneeId })) {
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>{task ? "Changes show up on everyone's board right away." : `Add a task to ${team.name}'s board.`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="Title" htmlFor="task-title" error={error}>
            <Input id="task-title" value={form.title} maxLength={200} autoFocus placeholder="e.g. Draft the project proposal"
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(null); }} aria-invalid={!!error} aria-describedby={error ? "task-title-error" : undefined} />
          </Field>
          <Field label="Description" htmlFor="task-description" optional>
            <Textarea id="task-description" value={form.description} maxLength={4000} placeholder="What does done look like?" onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assignee" htmlFor="task-assignee">
              <Select value={form.assigneeId || UNASSIGNED} onValueChange={(v) => setForm({ ...form, assigneeId: v === UNASSIGNED ? "" : v })}>
                <SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {team.members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}{m.userId === user.id ? " (you)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="task-due" optional>
              <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as KanbanTask["priority"] })}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {task && (
              <Field label="Status" htmlFor="task-status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger id="task-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{statuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{task ? "Save changes" : "Create task"}</Button>
          </DialogFooter>
        </form>
    </>
  );
}

export function TaskDialog({ open, onOpenChange, task, team }: { open: boolean; onOpenChange: (o: boolean) => void; task: KanbanTask | null; team: Team }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <TaskForm key={task?.id ?? "new"} task={task} team={team} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────

/** Status beside each task. Students change it from the pill; instructors only see it. */
function StatusPill({ task, onChange }: { task: KanbanTask; onChange?: (s: Status) => void }) {
  const st = statusOf(task.status);
  const body = (
    <>
      <st.icon weight={task.status === "done" ? "fill" : "bold"} className="size-3.5 shrink-0" aria-hidden />
      <span>{st.label}</span>
    </>
  );
  const pill = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold md:w-[8.75rem]";
  if (!onChange) return <span className={cn(pill, st.pill)}>{body}<span className="sr-only">, status</span></span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Status: ${st.label}. Change status of ${task.title}`}
        className={cn(pill, st.pill, "tap transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none")}>
        {body}<CaretDown weight="bold" className="ml-auto size-3 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        {statuses.map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => onChange(x.id)}>
            <x.icon aria-hidden /> {x.label}
            {x.id === task.status && <Check weight="bold" className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Assignee({ task }: { task: KanbanTask }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {task.assigneeId ? <Avatar name={task.assigneeName} size="xs" /> : <span className="size-6 shrink-0 rounded-full border-2 border-dashed border-input" aria-hidden />}
      <span className="truncate text-xs font-medium text-muted-foreground">{task.assigneeName}</span>
    </span>
  );
}

function Due({ task }: { task: KanbanTask }) {
  const due = task.status === "done" ? null : dueInfo(task.dueDate);
  if (!due) return <span className="text-xs text-muted-foreground/70">{task.status === "done" ? "—" : "No date"}</span>;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold", toneText[due.tone])}><CalendarBlank className="size-3.5 shrink-0" aria-hidden />{due.label}</span>;
}

const priorityCell = (task: KanbanTask) => (
  <Badge variant={priorityBadge[task.priority]} className="capitalize"><Flag weight="fill" aria-hidden />{task.priority}</Badge>
);

// Shared column widths for the header and the rows (md and up).
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_6rem_11rem_8rem_8.75rem_2rem] md:items-center md:gap-4";

function TaskRow({ task, onEdit, onDelete, onMove }: { task: KanbanTask; onEdit?: () => void; onDelete?: () => void; onMove?: (s: Status) => void }) {
  const done = task.status === "done";
  const title = (
    <>
      <span className={cn("block text-[0.9375rem] font-bold leading-snug md:truncate", done && "text-muted-foreground line-through decoration-muted-foreground/60")}>{task.title}</span>
      {task.description && <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2 md:line-clamp-none md:truncate">{task.description}</span>}
    </>
  );
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
      className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40", COLS, done && "bg-muted/30")}>
      <div className="min-w-0 flex-1">
        {onEdit
          ? <button type="button" onClick={onEdit} className="block w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label={`${task.title}. Edit task`}>{title}</button>
          : title}
        {/* Phones: details under the title */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 md:hidden">
          <StatusPill task={task} onChange={onMove} />{priorityCell(task)}<Due task={task} />
          <span className="basis-full"><Assignee task={task} /></span>
        </div>
      </div>
      <div className="hidden md:block">{priorityCell(task)}</div>
      <div className="hidden min-w-0 md:block"><Assignee task={task} /></div>
      <div className="hidden md:block"><Due task={task} /></div>
      <div className="hidden shrink-0 md:block"><StatusPill task={task} onChange={onMove} /></div>
      <div className="shrink-0">
        {onEdit && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Actions for ${task.title}`} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-[opacity,background-color] hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
              <DotsThree weight="bold" className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}><PencilSimple aria-hidden /> Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onDelete}><Trash aria-hidden /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.li>
  );
}

// ─── Task list ───────────────────────────────────────────────────────────

/**
 * The selected team's tasks as one list, each with its status beside it. Filters, the new-task button and the
 * edit dialog belong to the surrounding workspace; `readOnly` (instructors) shows the list without editing.
 * (Named TaskBoard for its callers; it replaced the three-column board.)
 */
export function TaskBoard({ scope = "all", query = "", readOnly, onEdit }: { scope?: "all" | "mine"; query?: string; readOnly?: boolean; onEdit?: (task: KanbanTask | null) => void }) {
  const user = useUser();
  const tasks = useAppStore((s) => s.kanbanTasks);
  const tasksLoaded = useAppStore((s) => s.loaded.tasks);
  const updateTask = useAppStore((s) => s.updateTask);
  const deleteTask = useAppStore((s) => s.deleteTask);

  const [deleting, setDeleting] = React.useState<KanbanTask | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  if (!tasksLoaded) {
    return (
      <div className="space-y-2 rounded-3xl border bg-card p-4" aria-busy="true" aria-label="Loading tasks">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = tasks
    .filter((t) => (scope === "all" || t.assigneeId === user.id) && (!q || `${t.title} ${t.description} ${t.assigneeName}`.toLowerCase().includes(q)))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => statusOf(a.t.status).order - statusOf(b.t.status).order || a.i - b.i) // stable within a status
    .map(({ t }) => t);
  const editable = !readOnly && !!onEdit;

  const move = (task: KanbanTask, status: Status) => {
    if (task.status === status) return;
    updateTask(task.id, { status });
    setAnnouncement(`"${task.title}" is now ${statusOf(status).label}.`);
  };

  return (
    <>
      <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-soft">
        {/* Totals per status */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <ListChecks weight="duotone" className="size-5 text-primary" aria-hidden />
          <h2 className="mr-1 text-sm font-extrabold">Tasks</h2>
          {statuses.slice().sort((a, b) => a.order - b.order).map((x) => (
            <span key={x.id} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", x.pill)}>
              <x.icon weight="bold" className="size-3" aria-hidden />{tasks.filter((t) => t.status === x.id).length}<span className="font-semibold">{x.label.toLowerCase()}</span>
            </span>
          ))}
          {editable && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onEdit(null)}><Plus weight="bold" aria-hidden /> Add task</Button>
          )}
        </div>

        {/* Column labels (md and up) */}
        <div className={cn("hidden shrink-0 border-b bg-muted/40 px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground", COLS)} aria-hidden>
          <span>Task</span><span>Priority</span><span>Assignee</span><span>Due</span><span>Status</span><span />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={ListChecks} className="py-12"
            title={tasks.length === 0 ? "No tasks yet" : "No tasks match"}
            description={tasks.length === 0 ? (editable ? "Add the first task, or let the AI suggest some from your chat." : "This team hasn't added any tasks.") : "Try another filter."} />
        ) : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto scroll-thin" aria-label="Tasks">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <TaskRow key={t.id} task={t}
                  onEdit={editable ? () => onEdit?.(t) : undefined}
                  onDelete={editable ? () => setDeleting(t) : undefined}
                  onMove={readOnly ? undefined : (s) => move(t, s)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this task?"
        description={deleting ? `"${deleting.title}" will be removed for the whole team. This can't be undone.` : ""}
        confirmLabel="Delete task"
        onConfirm={() => { if (deleting) deleteTask(deleting.id); setDeleting(null); }}
      />
    </>
  );
}
