"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarBlank, CaretDown, ChatCircle, ClockCounterClockwise, Check, CheckCircle, CircleDashed, DotsThree, Flag, ListChecks, PencilSimple, Plus, Spinner, Timer, Trash,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { addChecklistItem, addTaskComment, deleteChecklistItem, deleteTaskComment, getChecklist, getTaskComments, getTaskHistory, setChecklistItemDone } from "@/app/actions";
import { useAppStore, useLive } from "@/lib/store";
import { cn, dueInfo, timeAgo, toneText } from "@/lib/utils";
import type { ChecklistItem, KanbanTask, TaskComment, TaskEvent, Team } from "@/lib/types";
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
import { MeetingNotesButton } from "@/components/student/meeting-notes";
import { FocusButton, useMinutes } from "@/components/student/focus-timer";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import {intl, msg, t, num } from "@/lib/i18n";

type Status = KanbanTask["status"];

// List order: work in flight first, then what's waiting, then what's finished.
const statuses: { id: Status; label: string; icon: Icon; pill: string; order: number }[] = [
  { id: "todo", label: msg("To do"), icon: CircleDashed, pill: "bg-muted text-muted-foreground", order: 1 },
  { id: "in-progress", label: msg("In progress"), icon: Spinner, pill: "bg-warm/15 text-warm-text", order: 0 },
  { id: "done", label: msg("Done"), icon: CheckCircle, pill: "bg-success/12 text-success", order: 2 },
];
const statusOf = (id: Status) => statuses.find((x) => x.id === id)!;

const priorityBadge = { high: "danger", medium: "warning", low: "muted" } as const;
const UNASSIGNED = "none"; // Radix Select reserves the empty string

// ─── Checklist (inside the edit dialog) ───────────────────────────────────

function TaskChecklist({ task, team }: { task: KanbanTask; team: Team }) {
  const { t } = useT();
  const fetchTasks = useAppStore((s) => s.fetchTasks);
  const [items, setItems] = React.useState<ChecklistItem[] | null>(null);
  const [draft, setDraft] = React.useState("");

  const load = React.useCallback(() => getChecklist(task.id).then(setItems).catch((err) => {
    console.error("Loading checklist failed:", err);
    setItems((i) => i ?? []);
  }), [task.id]);
  const live = useLive("task_checklist_items");
  React.useEffect(() => { load(); }, [load, live]);

  async function run(fn: () => Promise<void>, fail: string) {
    try {
      await fn();
    } catch (err) {
      console.error(fail, err);
      toast.error(fail);
    }
    await Promise.all([load(), fetchTasks(team.id)]); // the board shows "2/5"
  }

  function toggle(item: ChecklistItem) {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) ?? null);
    run(() => setChecklistItemDone(item.id, !item.done), t("Could not update the step"));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    run(() => addChecklistItem(task.id, body), t("Could not add the step"));
  }

  const done = items?.filter((i) => i.done).length ?? 0;
  return (
    <section aria-labelledby="task-checklist-title" className="border-t pt-4">
      <h3 id="task-checklist-title" className="flex items-center gap-1.5 text-sm font-bold">
        <ListChecks weight="duotone" className="size-4 text-primary" aria-hidden /> {t("Checklist")}
        {!!items?.length && <span className="font-semibold text-muted-foreground">{num(done)}/{num(items.length)}</span>}
      </h3>
      {items && items.length > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {!items ? (
        <div className="mt-3" aria-busy="true"><Skeleton className="h-8" /></div>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {items.map((i) => (
            <li key={i.id} className="group/step flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-accent/40">
              <input type="checkbox" id={`step-${i.id}`} checked={i.done} onChange={() => toggle(i)} className="size-4 shrink-0 accent-[var(--color-success)]" />
              <label htmlFor={`step-${i.id}`} className={cn("min-w-0 flex-1 break-words text-sm", i.done && "text-muted-foreground line-through")}>{i.body}</label>
              <button type="button" onClick={() => run(() => deleteChecklistItem(i.id), t("Could not delete the step"))}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/step:opacity-100 max-md:opacity-100"
                aria-label={t("Delete step: {body}", { body: i.body })}>
                <Trash className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-2 flex gap-2">
        <label htmlFor="task-step" className="sr-only">{t("Add a step")}</label>
        <Input id="task-step" value={draft} maxLength={200} placeholder={t("Add a step…")} className="h-9 flex-1" onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" variant="secondary" size="sm" className="h-9" disabled={!draft.trim()}><Plus aria-hidden />{t("Add")}</Button>
      </form>
    </section>
  );
}

// ─── History (inside the edit dialog) ─────────────────────────────────────

const statusName = (v: string | null) => ({ todo: t("To do"), in_progress: t("In progress"), done: t("Done") })[v ?? ""] ?? v ?? "none";
const dateName = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString(intl(), { day: "numeric", month: "short" }) : t("no date"));

function describe(e: TaskEvent) {
  switch (e.field) {
    case "created": return <>{t("created the task")}</>;
    case "status": return <>{t("moved it from")} <b>{statusName(e.oldValue)}</b> {t("to")} <b>{statusName(e.newValue)}</b></>;
    case "assignee": return e.newValue ? <>{t("assigned it to")} <b>{e.newValue}</b></> : <>{t("unassigned")} <b>{e.oldValue ?? t("it")}</b></>;
    case "due_date": return <>{t("changed the due date from")} <b>{dateName(e.oldValue)}</b> {t("to")} <b>{dateName(e.newValue)}</b></>;
    case "priority": return <>{t("set priority to")} <b>{e.newValue}</b></>;
    case "title": return <>{t("renamed it from")} <b>{e.oldValue}</b></>;
  }
}

/** Who changed what, newest first. Collapsed by default: it is for "wait, who moved this?" moments. */
function TaskHistory({ task }: { task: KanbanTask }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<TaskEvent[] | null>(null);

  function toggle() {
    if (!open && !events) getTaskHistory(task.id).then(setEvents).catch((err) => { console.error("Loading history failed:", err); setEvents([]); });
    setOpen(!open);
  }

  return (
    <section className="border-t pt-3">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="task-history"
        className="flex w-full items-center gap-1.5 rounded-md text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <ClockCounterClockwise weight="duotone" className="size-4 text-primary" aria-hidden /> {t("History")}
        <CaretDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="task-history" className="mt-2">
          {!events ? <Skeleton className="h-10" /> : (
            <ol className="relative max-h-56 space-y-2.5 overflow-y-auto border-l pl-4 scroll-thin">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-border ring-2 ring-card" aria-hidden />
                  <span className="font-semibold">{e.actorName ?? t("ScholarSync")}</span> {describe(e)}
                  <time dateTime={e.createdAt} className="ml-1.5 text-xs text-muted-foreground">{timeAgo(e.createdAt)}</time>
                </li>
              ))}
              {!events.some((e) => e.field === "created") && <li className="text-xs text-muted-foreground">{t("Changes before history was switched on weren't recorded.")}</li>}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Comments (inside the edit dialog) ───────────────────────────────────

function TaskComments({ task, team }: { task: KanbanTask; team: Team }) {
  const { t } = useT();
  const user = useUser();
  const fetchTasks = useAppStore((s) => s.fetchTasks);
  const [comments, setComments] = React.useState<TaskComment[] | null>(null);
  const [draft, setDraft] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  const load = React.useCallback(() => getTaskComments(task.id).then(setComments).catch((err) => {
    console.error("Loading comments failed:", err);
    setComments((c) => c ?? []);
  }), [task.id]);
  const live = useLive("task_comments");
  React.useEffect(() => { load(); }, [load, live]);

  async function run(fn: () => Promise<void>, fail: string) {
    try {
      await fn();
      await Promise.all([load(), fetchTasks(team.id)]); // the board shows the comment count
      return true;
    } catch (err) {
      console.error(fail, err);
      toast.error(fail);
      return false;
    }
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    if (await run(() => addTaskComment(task.id, draft), t("Could not post the comment"))) setDraft("");
    setPosting(false);
  }

  return (
    <section aria-labelledby="task-comments-title" className="border-t pt-4">
      <h3 id="task-comments-title" className="flex items-center gap-1.5 text-sm font-bold">
        <ChatCircle weight="duotone" className="size-4 text-primary" aria-hidden /> {t("Comments")}
        {comments && comments.length > 0 && <span className="font-semibold text-muted-foreground">{num(comments.length)}</span>}
      </h3>
      {!comments ? (
        <div className="mt-3 space-y-2" aria-busy="true"><Skeleton className="h-12" /></div>
      ) : comments.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("No comments yet. Ask a question or leave an update for the team.")}</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1 scroll-thin">
          {comments.map((c) => (
            <li key={c.id} className="group/comment flex gap-2.5">
              <Avatar name={c.authorName} id={c.authorId} size="xs" className="mt-0.5" />
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-muted px-3 py-2">
                <p className="flex items-baseline gap-2 text-xs">
                  <span className="font-bold">{c.authorId === user.id ? t("You") : c.authorName}</span>
                  <time dateTime={c.createdAt} className="text-muted-foreground">{timeAgo(c.createdAt)}</time>
                  {c.authorId === user.id && (
                    <button type="button" onClick={() => run(() => deleteTaskComment(c.id), t("Could not delete the comment"))}
                      className="ml-auto rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/comment:opacity-100"
                      aria-label={t("Delete your comment")}>
                      <Trash className="size-3.5" aria-hidden />
                    </button>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={post} className="mt-3 flex items-end gap-2">
        <label htmlFor="task-comment" className="sr-only">{t("Add a comment")}</label>
        <Textarea id="task-comment" value={draft} maxLength={2000} rows={1} placeholder={t("Add a comment…")} className="min-h-10 flex-1 resize-none"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(e); }} />
        <Button type="submit" variant="secondary" loading={posting} disabled={!draft.trim()}>{t("Comment")}</Button>
      </form>
    </section>
  );
}

// ─── Task dialog (create + edit) ─────────────────────────────────────────

// The form mounts with the dialog content, so it always starts from the task being edited (or blank).
function TaskForm({ onClose, task, team }: { onClose: () => void; task: KanbanTask | null; team: Team }) {
  const { t } = useT();
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
      setError(t("Give the task a short title."));
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
          <DialogTitle>{task ? t("Edit task") : t("New task")}</DialogTitle>
          <DialogDescription>{task ? t("Changes show up on everyone's board right away.") : t("Add a task to {name}'s board.", { name: team.name })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label={t("Title")} htmlFor="task-title" error={error}>
            <Input id="task-title" value={form.title} maxLength={200} autoFocus placeholder={t("e.g. Draft the project proposal")}
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(null); }} aria-invalid={!!error} aria-describedby={error ? "task-title-error" : undefined} />
          </Field>
          <Field label={t("Description")} htmlFor="task-description" optional>
            <Textarea id="task-description" value={form.description} maxLength={4000} placeholder={t("What does done look like?")} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Assignee")} htmlFor="task-assignee">
              <Select value={form.assigneeId || UNASSIGNED} onValueChange={(v) => setForm({ ...form, assigneeId: v === UNASSIGNED ? "" : v })}>
                <SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>{t("Unassigned")}</SelectItem>
                  {team.members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}{m.userId === user.id ? t(" (you)") : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Due date")} htmlFor="task-due" optional>
              <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label={t("Priority")} htmlFor="task-priority">
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as KanbanTask["priority"] })}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t("High")}</SelectItem>
                  <SelectItem value="medium">{t("Medium")}</SelectItem>
                  <SelectItem value="low">{t("Low")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {task && (
              <Field label={t("Status")} htmlFor="task-status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger id="task-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{statuses.map((c) => <SelectItem key={c.id} value={c.id}>{t(c.label)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{task ? t("Save changes") : t("Create task")}</Button>
          </DialogFooter>
        </form>
        {task && <FocusButton task={task} teamId={team.id} disabled={team.courseArchived} />}
        {task && <TaskChecklist task={task} team={team} />}
        {task && <TaskComments task={task} team={team} />}
        {task && <TaskHistory task={task} />}
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
  const { t } = useT();
  const st = statusOf(task.status);
  const body = (
    <>
      <st.icon weight={task.status === "done" ? "fill" : "bold"} className="size-3.5 shrink-0" aria-hidden />
      <span>{t(st.label)}</span>
    </>
  );
  const pill = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold md:w-[8.75rem]";
  if (!onChange) return <span className={cn(pill, st.pill)}>{body}<span className="sr-only">{t(", status")}</span></span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("Status: {label}. Change status of {title}", { label: t(st.label), title: task.title })}
        className={cn(pill, st.pill, "tap transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none")}>
        {body}<CaretDown weight="bold" className="ml-auto size-3 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("Set status")}</DropdownMenuLabel>
        {statuses.map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => onChange(x.id)}>
            <x.icon aria-hidden /> {t(x.label)}
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
      {task.assigneeId ? <Avatar name={task.assigneeName} id={task.assigneeId} size="xs" /> : <span className="size-6 shrink-0 rounded-full border-2 border-dashed border-input" aria-hidden />}
      <span className="truncate text-xs font-medium text-muted-foreground">{task.assigneeName}</span>
    </span>
  );
}

function Due({ task }: { task: KanbanTask }) {
  const { t } = useT();
  const due = task.status === "done" ? null : dueInfo(task.dueDate);
  if (!due) return <span className="text-xs text-muted-foreground/70">{task.status === "done" ? "—" : t("No date")}</span>;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold", toneText[due.tone])}><CalendarBlank className="size-3.5 shrink-0" aria-hidden />{due.label}</span>;
}

const priorityCell = (task: KanbanTask) => (
  <Badge variant={priorityBadge[task.priority]} className="capitalize"><Flag weight="fill" aria-hidden />{task.priority}</Badge>
);

// Shared column widths for the header and the rows (md and up).
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_6rem_11rem_8rem_8.75rem_2rem] md:items-center md:gap-4";

function TaskRow({ task, onEdit, onDelete, onMove }: { task: KanbanTask; onEdit?: () => void; onDelete?: () => void; onMove?: (s: Status) => void }) {
  const { t } = useT();
  const done = task.status === "done";
  const minutes = useMinutes();
  const title = (
    <>
      <span className={cn("block text-[0.9375rem] font-bold leading-snug md:truncate", done && "text-muted-foreground line-through decoration-muted-foreground/60")}>{task.title}</span>
      {task.description && <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2 md:line-clamp-none md:truncate">{task.description}</span>}
      {(task.commentCount > 0 || task.checklistTotal > 0 || task.focusMinutes > 0) && (
        <span className="mt-1 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          {task.checklistTotal > 0 && (
            <span className={cn("inline-flex items-center gap-1", task.checklistDone === task.checklistTotal && "text-success")}>
              <ListChecks className="size-3.5" aria-hidden />{num(task.checklistDone)}/{num(task.checklistTotal)}<span className="sr-only"> {t("steps done")}</span>
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <ChatCircle className="size-3.5" aria-hidden />{num(task.commentCount)}<span className="sr-only"> {task.commentCount === 1 ? t("comment") : t("comments")}</span>
            </span>
          )}
          {task.focusMinutes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden />{minutes(task.focusMinutes)}<span className="sr-only"> {t("of focus")}</span>
            </span>
          )}
        </span>
      )}
    </>
  );
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
      className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40", COLS, done && "bg-muted/30")}>
      <div className="min-w-0 flex-1">
        {onEdit
          ? <button type="button" onClick={onEdit} className="block w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label={t("{title}. Edit task", { title: task.title })}>{title}</button>
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
            <DropdownMenuTrigger aria-label={t("Actions for {title}", { title: task.title })} className="tap flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-[opacity,background-color] hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
              <DotsThree weight="bold" className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}><PencilSimple aria-hidden /> {t("Edit")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onDelete}><Trash aria-hidden /> {t("Delete")}</DropdownMenuItem>
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
  const { t } = useT();
  const user = useUser();
  const tasks = useAppStore((s) => s.kanbanTasks);
  const team = useAppStore((s) => s.selectedTeam);
  const tasksLoaded = useAppStore((s) => s.loaded.tasks);
  const updateTask = useAppStore((s) => s.updateTask);
  const deleteTask = useAppStore((s) => s.deleteTask);

  const [deleting, setDeleting] = React.useState<KanbanTask | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  if (!tasksLoaded) {
    return (
      <div className="space-y-2 rounded-3xl border bg-card p-4" aria-busy="true" aria-label={t("Loading tasks")}>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = tasks
    .filter((tt) => (scope === "all" || tt.assigneeId === user.id) && (!q || `${tt.title} ${tt.description} ${tt.assigneeName}`.toLowerCase().includes(q)))
    .map((tt, i) => ({ t: tt, i }))
    .sort((a, b) => statusOf(a.t.status).order - statusOf(b.t.status).order || a.i - b.i) // stable within a status
    .map(({ t }) => t);
  const editable = !readOnly && !!onEdit;

  const move = (task: KanbanTask, status: Status) => {
    if (task.status === status) return;
    updateTask(task.id, { status });
    setAnnouncement(t("\"{title}\" is now {label}.", { title: task.title, label: t(statusOf(status).label) }));
  };

  return (
    <>
      <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-soft">
        {/* Totals per status */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <ListChecks weight="duotone" className="size-5 text-primary" aria-hidden />
          <h2 className="mr-1 text-sm font-extrabold">{t("Tasks")}</h2>
          {statuses.slice().sort((a, b) => a.order - b.order).map((x) => (
            <span key={x.id} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", x.pill)}>
              <x.icon weight="bold" className="size-3" aria-hidden />{num(tasks.filter((tt) => tt.status === x.id).length)}<span className="font-semibold">{t(x.label).toLowerCase()}</span>
            </span>
          ))}
          {editable && (
            <div className="ml-auto flex gap-1">
              {team && !team.courseArchived && <MeetingNotesButton team={team} />}
              <Button size="sm" variant="ghost" onClick={() => onEdit(null)}><Plus weight="bold" aria-hidden /> {t("Add task")}</Button>
            </div>
          )}
        </div>

        {/* Column labels (md and up) */}
        <div className={cn("hidden shrink-0 border-b bg-muted/40 px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground", COLS)} aria-hidden>
          <span>{t("Task")}</span><span>{t("Priority")}</span><span>{t("Assignee")}</span><span>{t("Due")}</span><span>{t("Status")}</span><span />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={ListChecks} className="py-12"
            title={tasks.length === 0 ? t("No tasks yet") : t("No tasks match")}
            description={tasks.length === 0 ? (editable ? t("Add the first task, or let the AI suggest some from your chat.") : t("This team hasn't added any tasks.")) : t("Try another filter.")} />
        ) : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto scroll-thin" aria-label={t("Tasks")}>
            <AnimatePresence initial={false}>
              {visible.map((tt) => (
                <TaskRow key={tt.id} task={tt}
                  onEdit={editable ? () => onEdit?.(tt) : undefined}
                  onDelete={editable ? () => setDeleting(tt) : undefined}
                  onMove={readOnly ? undefined : (s) => move(tt, s)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("Delete this task?")}
        description={deleting ? t("\"{title}\" will be removed for the whole team. This can't be undone.", { title: deleting.title }) : ""}
        confirmLabel={t("Delete task")}
        onConfirm={() => { if (deleting) deleteTask(deleting.id); setDeleting(null); }}
      />
    </>
  );
}
