"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarPlus, ChalkboardTeacher, Clock, MapPin, Plus, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { addOfficeHours, bookOfficeHour, cancelOfficeHour, deleteOfficeHour, getOfficeHours } from "@/app/actions";
import { useLive } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { OfficeHourSlot } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { intl, t, tn } from "@/lib/i18n";

const LENGTHS = [10, 15, 20, 30, 45, 60];
const time = (iso: string) => new Date(iso).toLocaleTimeString(intl(), { hour: "numeric", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayName = (iso: string) => new Date(iso).toLocaleDateString(intl(), { weekday: "long", day: "numeric", month: "long" });
const end = (s: OfficeHourSlot) => new Date(new Date(s.startsAt).getTime() + s.minutes * 60_000).toISOString();
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/** Back-to-back slots from a local date and time, as ISO instants (the browser knows the instructor's time zone). */
function slotStarts(date: string, start: string, minutes: number, count: number) {
  const first = new Date(`${date}T${start}`);
  return Number.isNaN(first.getTime()) ? [] : Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * minutes * 60_000).toISOString());
}

function AddSlotsDialog({ courseId, open, onOpenChange, onAdded }: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const { t } = useT();
  const [date, setDate] = React.useState("");
  const [start, setStart] = React.useState("14:00");
  const [minutes, setMinutes] = React.useState(20);
  const [count, setCount] = React.useState(3);
  const [location, setLocation] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const starts = slotStarts(date, start, minutes, count);
  const past = starts.length > 0 && new Date(starts[0]).getTime() <= Date.now();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await addOfficeHours(courseId, { starts, minutes, location, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast.success(tn(count, "{n} office-hours slot added", "{n} office-hours slots added"), { description: t("Students in the course can book them now.") });
      onAdded();
      onOpenChange(false);
    } catch (err) {
      console.error("Adding office hours failed:", err);
      toast.error(t("Could not add the slots"));
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add office hours")}</DialogTitle>
          <DialogDescription>{t("Back-to-back slots; each team can book one at a time.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Date")} htmlFor="oh-date"><Input id="oh-date" type="date" min={localToday()} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label={t("First slot starts")} htmlFor="oh-start"><Input id="oh-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
            <Field label={t("Length of each")} htmlFor="oh-length">
              <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                <SelectTrigger id="oh-length"><SelectValue /></SelectTrigger>
                <SelectContent>{LENGTHS.map((m) => <SelectItem key={m} value={String(m)}>{m} {t("minutes")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("Number of slots")} htmlFor="oh-count">
              <Input id="oh-count" type="number" inputMode="numeric" min={1} max={12} value={count} onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
            </Field>
          </div>
          <Field label={t("Where")} htmlFor="oh-location" optional>
            <Input id="oh-location" value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} placeholder={t("Room 402, or a video call link")} />
          </Field>
          {starts.length > 0 && (
            <p className={cn("text-sm", past ? "font-semibold text-destructive" : "text-muted-foreground")} role={past ? "alert" : undefined}>
              {past ? t("That time has already passed.") : t("{times} until {end}", { times: starts.map(time).join(", "), end: time(new Date(new Date(starts.at(-1)!).getTime() + minutes * 60_000).toISOString()) })}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving} disabled={!starts.length || past}>{tn(count, "Add {n} slot", "Add {n} slots")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookDialog({ slot, onOpenChange, onBooked }: { slot: OfficeHourSlot | null; onOpenChange: (o: boolean) => void; onBooked: () => void }) {
  const { t } = useT();
  const [topic, setTopic] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setSaving(true);
    try {
      const problem = await bookOfficeHour(slot.id, topic);
      if (problem) toast.error(t(problem));
      else {
        toast.success(t("Office hours booked"), { description: t("Your team and the instructor were told. You'll get a reminder an hour before.") });
        setTopic("");
        onOpenChange(false);
      }
      onBooked();
    } catch (err) {
      console.error("Booking failed:", err);
      toast.error(t("Could not book that time"));
    }
    setSaving(false);
  }

  return (
    <Dialog open={!!slot} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Book office hours")}</DialogTitle>
          <DialogDescription>{slot ? t("{day}, {start}–{end}{where}. For your whole team.", { day: dayName(slot.startsAt), start: time(slot.startsAt), end: time(end(slot)), where: slot.location ? ` · ${slot.location}` : "" }) : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={book} className="space-y-4">
          <Field label={t("What do you want to discuss?")} htmlFor="oh-topic" optional>
            <Textarea id="oh-topic" rows={3} maxLength={500} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("e.g. Feedback on our database design before the milestone")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={saving}>{t("Book this time")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Office hours for a course. The instructor adds slots and sees who booked what; students book one slot per team,
 * download it for their calendar and can cancel it.
 */
export function OfficeHours({ courseId, instructor, readOnly }: { courseId: string; instructor: boolean; readOnly?: boolean }) {
  const { t } = useT();
  const [data, setData] = React.useState<{ slots: OfficeHourSlot[]; myTeamId: string | null } | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [booking, setBooking] = React.useState<OfficeHourSlot | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "cancel" | "delete"; slot: OfficeHourSlot } | null>(null);
  const live = useLive("office_hours", "team_members");

  const load = React.useCallback(() => getOfficeHours(courseId).then(setData).catch((err) => console.error("Loading office hours failed:", err)), [courseId]);
  React.useEffect(() => { load(); }, [load, live]);

  async function confirmed() {
    if (!confirm) return;
    try {
      if (confirm.kind === "delete") {
        await deleteOfficeHour(confirm.slot.id);
        toast.success(t("Slot removed"), { description: confirm.slot.booked ? t("The team that booked it was told.") : undefined });
      } else {
        const problem = await cancelOfficeHour(confirm.slot.id);
        if (problem) toast.error(t(problem));
        else toast.success(t("Booking cancelled"), { description: instructor ? t("The team was told.") : t("The instructor was told.") });
      }
      await load();
    } catch (err) {
      console.error("Changing office hours failed:", err);
      toast.error(t("Could not change the office hours"));
    }
  }

  const slots = data?.slots ?? [];
  const mine = slots.find((s) => s.mine);
  const days: { key: string; slots: OfficeHourSlot[] }[] = [];
  for (const s of slots) {
    const k = dayKey(s.startsAt);
    if (days.at(-1)?.key === k) days.at(-1)!.slots.push(s);
    else days.push({ key: k, slots: [s] });
  }
  const canBook = !instructor && !readOnly && !!data?.myTeamId && !mine;

  return (
    <Card className="p-5 sm:p-6" role="region" aria-labelledby="office-hours-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sage text-success"><ChalkboardTeacher weight="fill" className="size-[1.125rem]" aria-hidden /></span>
        <h2 id="office-hours-title" className="text-lg font-extrabold">{t("Office hours")}</h2>
        {instructor && !readOnly && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding(true)}><Plus aria-hidden /> {t("Add times")}</Button>}
      </div>

      {data === null ? (
        <Skeleton className="mt-4 h-20" />
      ) : (
        <>
          {mine && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sage px-4 py-3" role="status">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t("Your team is booked: {day}, {start}–{end}", { day: dayName(mine.startsAt), start: time(mine.startsAt), end: time(end(mine)) })}</p>
                <p className="text-xs text-foreground/75">{[mine.location, mine.topic && t("Topic: {topic}", { topic: mine.topic }), mine.bookedByName && t("booked by {bookedByName}", { bookedByName: mine.bookedByName })].filter(Boolean).join(" · ")}</p>
              </div>
              <Button asChild size="sm" variant="outline"><a href={`/api/office-hours/${mine.id}`} download><CalendarPlus aria-hidden /> {t("Add to calendar")}</a></Button>
              {!readOnly && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "cancel", slot: mine })}><X aria-hidden /> {t("Cancel booking")}</Button>}
            </div>
          )}

          {days.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {instructor ? t("No upcoming office hours. Add times and teams can book them.") : t("No office hours are open right now.")}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {!instructor && !data.myTeamId && <p className="text-xs text-muted-foreground">{t("Once you're on a team you can book a time.")}</p>}
              {days.map((d) => (
                <section key={d.key} aria-label={dayName(d.slots[0].startsAt)}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{dayName(d.slots[0].startsAt)}</h3>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {d.slots.map((s) => (
                      <li key={s.id} className={cn("flex items-center gap-3 rounded-2xl border px-3.5 py-2.5", s.mine ? "border-success/40 bg-sage/60" : s.booked ? "bg-muted/50" : "bg-card")}>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-bold tabular-nums"><Clock className="size-3.5 text-muted-foreground" aria-hidden />{time(s.startsAt)}–{time(end(s))}</p>
                          {s.location && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" aria-hidden />{s.location}</p>}
                          {s.booked && s.teamName && <p className="truncate text-xs font-semibold">{s.teamName}{s.topic ? `: ${s.topic}` : ""}</p>}
                        </div>
                        {!s.booked ? (
                          canBook ? <Button size="sm" onClick={() => setBooking(s)} aria-label={t("Book {time}", { time: time(s.startsAt) })}>{t("Book")}</Button> : <Badge variant="success">{t("Free")}</Badge>
                        ) : s.mine ? <Badge variant="success">{t("Yours")}</Badge> : <Badge variant="muted">{t("Booked")}</Badge>}
                        {instructor && !readOnly && (
                          <span className="flex shrink-0">
                            {s.booked && <Button variant="ghost" size="icon-sm" aria-label={t("Cancel {teamName}'s booking at {time}", { teamName: s.teamName, time: time(s.startsAt) })} onClick={() => setConfirm({ kind: "cancel", slot: s })}><X aria-hidden /></Button>}
                            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={t("Remove the {time} slot", { time: time(s.startsAt) })} onClick={() => setConfirm({ kind: "delete", slot: s })}><Trash aria-hidden /></Button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {instructor && <AddSlotsDialog courseId={courseId} open={adding} onOpenChange={setAdding} onAdded={load} />}
      {!instructor && <BookDialog slot={booking} onOpenChange={(o) => { if (!o) setBooking(null); }} onBooked={load} />}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm?.kind === "delete" ? t("Remove this slot?") : t("Cancel this booking?")}
        confirmLabel={confirm?.kind === "delete" ? t("Remove slot") : t("Cancel booking")}
        description={confirm ? `${dayName(confirm.slot.startsAt)}, ${time(confirm.slot.startsAt)}. ${confirm.slot.booked ? (instructor ? t("The team that booked it is told.") : t("The instructor is told, and the time is free for others.")) : ""}` : ""}
        onConfirm={confirmed} />
    </Card>
  );
}
