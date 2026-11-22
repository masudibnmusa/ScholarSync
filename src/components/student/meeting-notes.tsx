"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Notepad, Plus, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { createTasks, extractNoteTasks } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/components/locale";
import { t, tn } from "@/lib/i18n";

const UNASSIGNED = "none"; // Radix Select reserves the empty string
type Row = { key: number; keep: boolean; title: string; description: string; assigneeId: string; dueDate: string };

/**
 * Paste meeting notes; the AI lists the action items (who does what by when); the student checks, fixes and adds them
 * to the board in one go. Nothing is added until they confirm.
 */
export function MeetingNotesButton({ team }: { team: Team }) {
  const { t } = useT();
  const user = useUser();
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [reading, setReading] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const kept = rows?.filter((r) => r.keep && r.title.trim()) ?? [];

  async function read(e: React.FormEvent) {
    e.preventDefault();
    setReading(true);
    try {
      const items = await extractNoteTasks(team.id, notes);
      setRows(items.map((i, key) => ({ key, keep: true, title: i.title, description: i.description, assigneeId: i.ownerId ?? "", dueDate: i.dueDate ?? "" })));
    } catch (err) {
      console.error("Reading the notes failed:", err);
      toast.error(t("Could not read the notes. The AI may be busy; try again in a minute."));
    }
    setReading(false);
  }

  async function add() {
    setAdding(true);
    try {
      await createTasks(team.id, kept.map((r) => ({ title: r.title.trim(), description: r.description, priority: "medium", dueDate: r.dueDate, assigneeId: r.assigneeId })));
      const { fetchTasks, fetchTeams } = useAppStore.getState();
      await Promise.all([fetchTasks(team.id), fetchTeams()]);
      toast.success(tn(kept.length, "{n} task added to the board", "{n} tasks added to the board"));
      setOpen(false);
      setNotes("");
      setRows(null);
    } catch (err) {
      console.error("Adding the tasks failed:", err);
      toast.error(t("Could not add the tasks"));
    }
    setAdding(false);
  }

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Notepad aria-hidden /> {t("From notes")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-sky text-info"><Notepad weight="fill" className="size-4" aria-hidden /></span>
            {t("Tasks from meeting notes")}
          </DialogTitle>
          <DialogDescription>{t("Paste your notes. The AI lists who does what by when; you check it before anything is added.")}</DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <form onSubmit={read} className="min-w-0 space-y-3">
            <Field label={t("Meeting notes")} htmlFor="meeting-notes">
              <Textarea id="meeting-notes" rows={9} maxLength={10_000} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={t("e.g.\nAda will set up the database by Friday.\nBen does the login page.\nWe still need someone to write the test plan.")} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={reading} disabled={notes.trim().length < 10}>{!reading && <Sparkle weight="fill" aria-hidden />}{reading ? t("Reading your notes…") : t("Find action items")}</Button>
            </div>
          </form>
        ) : (
          <div className="min-w-0 space-y-4">
            {rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">{t("No action items found. Notes that say who will do what work best.")}</p>
            ) : (
              <ul className="space-y-2" aria-label={t("Action items")}>
                {rows.map((r, i) => (
                  <li key={r.key} className={cn("rounded-2xl border p-3 transition-opacity", !r.keep && "opacity-55")}>
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={r.keep} onChange={(e) => set(r.key, { keep: e.target.checked })} aria-label={t("Add item {n}", { n: i + 1 })}
                        className="size-4 shrink-0 accent-[var(--primary)]" />
                      <Input value={r.title} maxLength={200} onChange={(e) => set(r.key, { title: e.target.value })} aria-label={t("Item {n} title", { n: i + 1 })} className="h-9" />
                    </div>
                    <div className="mt-2 grid gap-2 pl-6.5 sm:grid-cols-2">
                      <Select value={r.assigneeId || UNASSIGNED} onValueChange={(v) => set(r.key, { assigneeId: v === UNASSIGNED ? "" : v })}>
                        <SelectTrigger aria-label={t("Item {n} assignee", { n: i + 1 })} className="h-9 md:h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>{t("Unassigned")}</SelectItem>
                          {team.members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}{m.userId === user.id ? t(" (you)") : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="date" value={r.dueDate} onChange={(e) => set(r.key, { dueDate: e.target.value })} aria-label={t("Item {n} due date", { n: i + 1 })} className="h-9" />
                    </div>
                    {r.description && <p className="mt-2 pl-6.5 text-xs text-muted-foreground">{r.description}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setRows(null)}><ArrowLeft aria-hidden /> {t("Back to notes")}</Button>
              <Button loading={adding} disabled={!kept.length} onClick={add}>
                {!adding && <Plus weight="bold" aria-hidden />} {tn(kept.length, "Add {n} task", "Add {n} tasks")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
