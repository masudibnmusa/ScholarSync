"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, CalendarBlank, CheckCircle, CircleDashed, DotsThree, Flag, PencilSimple, Plus, Spinner, Trash,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { cn, dueInfo, toneText } from "@/lib/utils";
import type { KanbanTask, Team } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
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

const columns: { id: Status; label: string; icon: Icon; dot: string; empty: string }[] = [
  { id: "todo", label: "To do", icon: CircleDashed, dot: "bg-muted-foreground", empty: "Nothing waiting. Add a task or drop one here." },
  { id: "in-progress", label: "In progress", icon: Spinner, dot: "bg-warm", empty: "Drag a task here when someone starts it." },
  { id: "done", label: "Done", icon: CheckCircle, dot: "bg-success", empty: "Finished tasks land here." },
];

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
                  <SelectContent>{columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
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

// ─── Card ────────────────────────────────────────────────────────────────

function TaskCardBody({ task, lifted }: { task: KanbanTask; lifted?: boolean }) {
  const due = task.status === "done" ? null : dueInfo(task.dueDate);
  return (
    <div className={cn("rounded-2xl border bg-card p-3.5 text-left shadow-soft", lifted && "rotate-2 scale-[1.03] border-primary/40 shadow-lift")}>
      <div className="flex items-center justify-between gap-2 pr-8">
        <Badge variant={priorityBadge[task.priority]} className="capitalize"><Flag weight="fill" aria-hidden />{task.priority}</Badge>
      </div>
      <p className={cn("mt-2.5 text-[0.9375rem] font-bold leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
      {task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {task.assigneeId ? <Avatar name={task.assigneeName} size="xs" /> : <span className="size-6 shrink-0 rounded-full border-2 border-dashed border-input" aria-hidden />}
          <span className="truncate text-xs font-medium text-muted-foreground">{task.assigneeName}</span>
        </span>
        {due && <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-semibold", toneText[due.tone])}><CalendarBlank className="size-3.5" aria-hidden />{due.label}</span>}
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onMove }: { task: KanbanTask; onEdit: () => void; onDelete: () => void; onMove: (s: Status) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }} className="relative">
      {/* The whole card drags with a pointer; Enter opens it. Moving without dragging is in the ⋯ menu. */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-roledescription="Draggable task"
        aria-label={`${task.title}. ${task.priority} priority. Assigned to ${task.assigneeName}. Press Enter to edit.`}
        onClick={onEdit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}
        className={cn("cursor-grab touch-manipulation rounded-2xl transition-[opacity,transform] duration-200 hover:-translate-y-0.5 active:cursor-grabbing", isDragging && "opacity-30")}
      >
        <TaskCardBody task={task} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Actions for ${task.title}`} className="tap absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <DotsThree weight="bold" className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}><PencilSimple aria-hidden /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {columns.filter((c) => c.id !== task.status).map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => onMove(c.id)}><ArrowRight aria-hidden /> {c.label}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={onDelete}><Trash aria-hidden /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.li>
  );
}

function Column({ column, tasks, dragging, onAdd, children }: { column: (typeof columns)[number]; tasks: KanbanTask[]; dragging: boolean; onAdd?: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
      className={cn(
        "flex min-h-0 w-[84vw] max-w-sm shrink-0 snap-center flex-col rounded-3xl border bg-muted/50 p-3 transition-[background-color,border-color,box-shadow] duration-200 md:w-auto md:min-w-[14rem] md:max-w-none md:flex-1",
        dragging && "border-dashed",
        isOver && "border-primary bg-secondary/70 shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_18%,transparent)]",
      )}
    >
      <header className="mb-3 flex items-center gap-2 px-1.5">
        <span className={cn("size-2.5 rounded-full", column.dot)} aria-hidden />
        <h2 className="text-sm font-extrabold">{column.label}</h2>
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold tabular-nums text-muted-foreground shadow-soft">{tasks.length}</span>
        {column.id === "todo" && onAdd && (
          <button type="button" onClick={onAdd} aria-label="Add a task to To do" className="tap ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
            <Plus weight="bold" className="size-4" />
          </button>
        )}
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5 scroll-thin">
        <AnimatePresence initial={false} mode="popLayout">{children}</AnimatePresence>
        {tasks.length === 0 && (
          <li className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center">
            <column.icon className="size-6 text-muted-foreground/70" aria-hidden />
            <p className="text-xs text-muted-foreground">{column.empty}</p>
          </li>
        )}
      </ul>
    </section>
  );
}

// ─── Board ───────────────────────────────────────────────────────────────

/**
 * The three columns for the selected team. Filters, the new-task button and the edit dialog belong to the
 * surrounding workspace; `readOnly` (instructors) shows the same board without dragging or menus.
 */
export function TaskBoard({ scope = "all", query = "", readOnly, onEdit }: { scope?: "all" | "mine"; query?: string; readOnly?: boolean; onEdit?: (task: KanbanTask | null) => void }) {
  const user = useUser();
  const tasks = useAppStore((s) => s.kanbanTasks);
  const tasksLoaded = useAppStore((s) => s.loaded.tasks);
  const updateTask = useAppStore((s) => s.updateTask);
  const deleteTask = useAppStore((s) => s.deleteTask);

  const [deleting, setDeleting] = React.useState<KanbanTask | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // Dragging starts after a small move (mouse) or a short press (touch), so taps and scrolling still work.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  if (!tasksLoaded) {
    return <div className="flex h-full gap-3 overflow-hidden">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-full min-h-72 min-w-[17rem] flex-1 rounded-3xl" />)}</div>;
  }

  const q = query.trim().toLowerCase();
  const visible = tasks.filter((t) => (scope === "all" || t.assigneeId === user.id) && (!q || `${t.title} ${t.description} ${t.assigneeName}`.toLowerCase().includes(q)));
  const active = tasks.find((t) => t.id === activeId) ?? null;

  const move = (task: KanbanTask, status: Status) => {
    if (task.status === status) return;
    updateTask(task.id, { status });
    setAnnouncement(`Moved "${task.title}" to ${columns.find((c) => c.id === status)!.label}.`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const task = tasks.find((t) => t.id === e.active.id);
    if (task && e.over) move(task, e.over.id as Status);
  };

  const lanes = (
    <div className="flex h-full min-h-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 scroll-thin md:snap-none">
      {columns.map((c) => {
        const list = visible.filter((t) => t.status === c.id);
        return (
          <Column key={c.id} column={c} tasks={list} dragging={!!activeId} onAdd={readOnly || !onEdit ? undefined : () => onEdit(null)}>
            {list.map((t) => readOnly ? (
              <motion.li key={t.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <TaskCardBody task={t} />
              </motion.li>
            ) : (
              <TaskCard key={t.id} task={t} onEdit={() => onEdit?.(t)} onDelete={() => setDeleting(t)} onMove={(s) => move(t, s)} />
            ))}
          </Column>
        );
      })}
    </div>
  );

  return (
    <>
      {readOnly ? lanes : (
        <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          {lanes}
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
            {active && <TaskCardBody task={active} lifted />}
          </DragOverlay>
        </DndContext>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this task?"
        description={deleting ? `"${deleting.title}" will be removed from the board for the whole team. This can't be undone.` : ""}
        confirmLabel="Delete task"
        onConfirm={() => { if (deleting) deleteTask(deleting.id); setDeleting(null); }}
      />
    </>
  );
}
