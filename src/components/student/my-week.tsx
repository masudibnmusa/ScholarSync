"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CaretLeft, CaretRight, ChalkboardTeacher, CheckSquare, DownloadSimple, Flag } from "@phosphor-icons/react/dist/ssr";
import { getMyWeek } from "@/app/actions";
import { withSnapshot } from "@/lib/offline";
import { useUser } from "@/components/app/user-context";
import { cn, daysUntil, dueInfo, toneText, weekBucket } from "@/lib/utils";
import type { WeekItem } from "@/lib/types";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";
import { useT } from "@/components/locale";
import {intl, msg, t } from "@/lib/i18n";

const priorityBadge = { high: "danger", medium: "warning", low: "muted" } as const;
const hrefOf = (i: WeekItem) => (i.kind === "task" ? `/student?team=${i.teamId}&task=${i.id}` : `/student/courses/${i.courseId}`);

const clock = (iso: string) => new Date(iso).toLocaleTimeString(intl(), { hour: "numeric", minute: "2-digit" });
const KIND = {
  task: { icon: CheckSquare, tile: "bg-peach text-warm-text", chip: "bg-peach text-warm-text", dot: "bg-primary" },
  milestone: { icon: Flag, tile: "bg-butter text-warm-text", chip: "bg-sky text-info", dot: "bg-info" },
  "office-hours": { icon: ChalkboardTeacher, tile: "bg-sage text-success", chip: "bg-sage text-success", dot: "bg-success" },
} as const;

/** Due-date wording for tasks and milestones; office hours show their time (they can't be overdue). */
function whenOf(item: WeekItem) {
  if (item.kind !== "office-hours") return dueInfo(item.date);
  const soon = dueInfo(item.date);
  const n = daysUntil(item.date);
  const day = n === 0 ? t("Today") : n === 1 ? t("Tomorrow") : new Date(item.startsAt!).toLocaleDateString(intl(), { month: "short", day: "numeric" });
  return { label: t("{day}, {time}", { day, time: clock(item.startsAt!) }), tone: soon?.tone === "warning" ? "warning" as const : "muted" as const };
}

function ItemRow({ item }: { item: WeekItem }) {
  const { t } = useT();
  const due = whenOf(item);
  const Icon = KIND[item.kind].icon;
  return (
    <Link href={hrefOf(item)} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 outline-none">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", KIND[item.kind].tile)}>
        <Icon weight="fill" className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold group-hover:text-primary">
          {item.kind === "milestone" && <span className="text-muted-foreground">{t("Milestone ·")} </span>}{item.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.teamName} · {item.courseCode}{item.location ? ` · ${item.location}` : ""}</span>
      </span>
      {item.priority && <Badge variant={priorityBadge[item.priority]} className="hidden capitalize sm:inline-flex">{item.priority}</Badge>}
      {due && <span className={cn("w-28 shrink-0 text-right text-xs font-semibold", toneText[due.tone])}>{due.label}</span>}
    </Link>
  );
}

const LIST_DAYS = 21;
const WEEKDAYS = [msg("Mon"), msg("Tue"), msg("Wed"), msg("Thu"), msg("Fri"), msg("Sat"), msg("Sun")];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Month grid (weeks start Monday). Items sit on their due date; phones get dots instead of titles. */
function MonthView({ items }: { items: WeekItem[] }) {
  const { t } = useT();
  const [month, setMonth] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = isoOf(new Date());
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= days ? isoOf(new Date(month.getFullYear(), month.getMonth(), n)) : null;
  });
  const byDay = new Map<string, WeekItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Card className="p-3 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold" aria-live="polite">{month.toLocaleDateString(intl(), { month: "long", year: "numeric" })}</h2>
        <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{t("Today")}</Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} aria-label={t("Previous month")}><CaretLeft aria-hidden /></Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} aria-label={t("Next month")}><CaretRight aria-hidden /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{t(d)}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <li key={i} aria-hidden className="min-h-14 sm:min-h-24" />;
          const list = byDay.get(date) ?? [];
          const late = date < today;
          return (
            <li key={date} className={cn("flex min-h-14 flex-col gap-1 rounded-xl p-1 sm:min-h-24 sm:p-1.5", date === today ? "bg-primary/8 ring-1 ring-primary/30" : "bg-muted/40")}
              aria-label={`${new Date(date + "T00:00:00").toLocaleDateString(intl(), { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} due` : ""}`}>
              <span className={cn("text-xs font-bold tabular-nums", date === today ? "text-primary" : "text-muted-foreground")}>{Number(date.slice(8))}</span>
              {/* Phones: one dot per item */}
              {list.length > 0 && (
                <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                  {list.slice(0, 4).map((x) => <span key={`${x.kind}-${x.id}-${x.teamId}`} className={cn("size-1.5 rounded-full", late ? "bg-destructive" : KIND[x.kind].dot)} />)}
                </span>
              )}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {list.slice(0, 3).map((x) => (
                  <Link key={`${x.kind}-${x.id}-${x.teamId}`} href={hrefOf(x)} title={`${x.title} · ${x.teamName}`}
                    className={cn("truncate rounded-md px-1.5 py-0.5 text-left text-[0.6875rem] font-semibold outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
                      late ? "bg-rose text-destructive" : KIND[x.kind].chip)}>
                    {x.kind === "milestone" && <Flag weight="fill" className="mr-0.5 inline size-2.5" aria-hidden />}
                    {x.kind === "office-hours" && <span className="mr-0.5 font-bold">{clock(x.startsAt!)}</span>}{x.title}
                  </Link>
                ))}
                {list.length > 3 && <span className="px-1.5 text-[0.6875rem] font-semibold text-muted-foreground">+{list.length - 3} {t("more")}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />{t("Your tasks")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />{t("Milestones")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />{t("Overdue")}</span>
      </p>
    </Card>
  );
}

const subscribeSecond = (tick: () => void) => { const t = setInterval(tick, 1000); return () => clearInterval(t); };
/** The current time, updated every second; 0 during server render so hydration matches. */
const useNowSecond = () => React.useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000) * 1000, () => 0);

/** Analog watch face: hour, minute and second hands. */
function Watch({ now }: { now: Date }) {
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, cls: string, width: number) => (
    <line x1="50" y1="56" x2="50" y2={50 - len} transform={`rotate(${deg} 50 50)`} strokeWidth={width} strokeLinecap="round" className={cls} />
  );
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 drop-shadow-sm" aria-hidden>
      <circle cx="50" cy="50" r="47" className="fill-card stroke-border" strokeWidth="2" />
      <circle cx="50" cy="50" r="41" className="fill-sage/60" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1={i % 3 ? 13 : 11} x2="50" y2="17" transform={`rotate(${i * 30} 50 50)`} strokeWidth={i % 3 ? 1.5 : 2.5} strokeLinecap="round" className="stroke-sidebar-muted" />
      ))}
      {hand(h * 30, 22, "stroke-foreground", 4)}
      {hand(m * 6, 31, "stroke-foreground", 3)}
      {hand(s * 6, 34, "stroke-primary", 1.5)}
      <circle cx="50" cy="50" r="3.5" className="fill-primary" />
      <circle cx="50" cy="50" r="1.5" className="fill-card" />
    </svg>
  );
}

/** Live clock and this month at a glance: today highlighted, a dot on each day something is due. */
function TodayCard({ items, onOpenMonth }: { items: WeekItem[]; onOpenMonth: () => void }) {
  const { t } = useT();
  const ms = useNowSecond();
  if (!ms) return <Card className="h-[26rem] p-5" aria-hidden><Skeleton className="size-full" /></Card>;
  const now = new Date(ms);
  const today = isoOf(now);
  const parts = Object.fromEntries(new Intl.DateTimeFormat(intl(), { hour: "numeric", minute: "2-digit", second: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const due = new Map<string, WeekItem[]>();
  for (const i of items) due.set(i.date, [...(due.get(i.date) ?? []), i]);

  return (
    <Card className="overflow-hidden lg:sticky lg:top-6">
      <section aria-label={t("Current time")} className="flex items-center gap-4 bg-gradient-to-br from-sage/70 to-peach/50 p-5">
        <Watch now={now} />
        <div className="min-w-0">
          <time dateTime={now.toISOString()} className="block font-display font-bold leading-none tracking-tight tabular-nums">
            <span className="text-[2.25rem]">{parts.hour}:{parts.minute}</span>
            <span className="ml-0.5 text-base text-muted-foreground">:{parts.second}</span>
            {parts.dayPeriod && <span className="ml-1 text-sm font-semibold text-muted-foreground">{parts.dayPeriod}</span>}
          </time>
          <p className="mt-2 text-sm font-bold">{now.toLocaleDateString(intl(), { weekday: "long" })}</p>
          <p className="text-sm text-muted-foreground">{now.toLocaleDateString(intl(), { day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="mt-1 truncate text-[0.6875rem] font-semibold text-muted-foreground" title={t("Your time zone")}>{zone}</p>
        </div>
      </section>

      <section aria-label={t("This month")} className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">{now.toLocaleDateString(intl(), { month: "long", year: "numeric" })}</h2>
          <button type="button" onClick={onOpenMonth} className="tap inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-primary hover:bg-accent">
            {t("Month view")}<CaretRight className="size-3" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[0.625rem] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden>
          {WEEKDAYS.map((d) => <span key={d} className="py-1">{t(d).slice(0, 2)}</span>)}
        </div>
        <ol className="grid grid-cols-7 gap-y-0.5 text-center">
          {Array.from({ length: lead }, (_, i) => <li key={`pad-${i}`} aria-hidden />)}
          {Array.from({ length: days }, (_, i) => {
            const date = isoOf(new Date(now.getFullYear(), now.getMonth(), i + 1));
            const list = due.get(date) ?? [];
            const isToday = date === today;
            return (
              <li key={date} aria-current={isToday ? "date" : undefined}
                aria-label={`${new Date(date + "T00:00:00").toLocaleDateString(intl(), { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}${list.length ? `, ${list.length} due` : ""}`}
                title={list.map((x) => x.title).join("\n") || undefined}
                className="relative grid h-9 place-items-center">
                <span className={cn("grid size-8 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  isToday ? "bg-primary text-primary-foreground shadow-soft" : date < today ? "text-muted-foreground/70" : "text-foreground")}>{i + 1}</span>
                {list.length > 0 && <span className={cn("absolute bottom-0.5 size-1.5 rounded-full", isToday ? "bg-warm" : date < today ? "bg-destructive" : "bg-primary")} aria-hidden />}
              </li>
            );
          })}
        </ol>
      </section>
    </Card>
  );
}

/** Every dated thing a student owes, across all their teams, grouped by when it is due. */
export function MyWeek() {
  const { t } = useT();
  const user = useUser();
  const [all, setAll] = React.useState<WeekItem[] | null>(null);
  const [view, setView] = React.useState<"list" | "month">("list");
  const live = useLive("tasks", "course_milestones", "team_milestones", "submissions", "team_members", "office_hours");
  const items = React.useMemo(() => all?.filter((i) => daysUntil(i.date) <= LIST_DAYS) ?? null, [all]);
  React.useEffect(() => {
    withSnapshot(user.id, "week", getMyWeek).then(setAll).catch((err) => { console.error("Loading your week failed:", err); setAll([]); });
  }, [live, user.id]);

  const groups = React.useMemo(() => {
    const out: { label: string; items: WeekItem[] }[] = [];
    for (const i of items ?? []) {
      const label = weekBucket(i.date);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(i); else out.push({ label, items: [i] });
    }
    return out;
  }, [items]);

  const overdue = groups.find((g) => g.label === t("Overdue"))?.items.length ?? 0;
  const thisWeek = (items ?? []).filter((i) => weekBucket(i.date) !== "Next week" && weekBucket(i.date) !== "Later").length;

  return (
    <Page>
      <PageHeader title={t("My week")}
        description={!items ? " " : items.length === 0 ? t("Nothing dated is waiting on you.") : (overdue ? t("{thisWeek} due this week, {overdue} overdue, across all your teams.", { thisWeek, overdue }) : t("{thisWeek} due this week, across all your teams.", { thisWeek }))}>
        <div className="flex items-center gap-2">
          <Segmented label={t("View")} value={view} onChange={setView} options={[{ value: "list", label: t("List") }, { value: "month", label: t("Month") }]} />
          <Button variant="outline" asChild>
            <a href="/api/calendar" download title={t("Add your due dates to Google Calendar, Outlook or Apple Calendar")}><DownloadSimple aria-hidden /><span className="hidden sm:inline">{t("Export .ics")}</span><span className="sm:hidden">{t(".ics")}</span></a>
          </Button>
        </div>
      </PageHeader>
      {all && view === "month" ? (
        <MonthView items={all} />
      ) : (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
      {!items ? (
        <Card className="space-y-3 p-5" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={CalendarCheck} title={t("You're all caught up")} description={t("Tasks assigned to you with a due date, your teams' milestones and booked office hours show up here.")} /></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} aria-labelledby={`week-${g.label}`}>
              <h2 id={`week-${g.label}`} className={cn("mb-2 flex items-center gap-2 text-sm font-bold", g.label === t("Overdue") && "text-destructive")}>
                {g.label}<span className="font-semibold text-muted-foreground">{g.items.length}</span>
              </h2>
              <Card className="divide-y overflow-hidden">
                {g.items.map((i) => <ItemRow key={`${i.kind}-${i.id}-${i.teamId}`} item={i} />)}
              </Card>
            </section>
          ))}
        </div>
      )}
      </div>
      <TodayCard items={all ?? []} onOpenMonth={() => setView("month")} />
      </div>
      )}
    </Page>
  );
}
