"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CaretLeft, CaretRight, CheckSquare, DownloadSimple, Flag } from "@phosphor-icons/react/dist/ssr";
import { getMyWeek } from "@/app/actions";
import { cn, daysUntil, dueInfo, toneText, weekBucket } from "@/lib/utils";
import type { WeekItem } from "@/lib/types";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const priorityBadge = { high: "danger", medium: "warning", low: "muted" } as const;
const hrefOf = (i: WeekItem) => (i.kind === "task" ? `/student?team=${i.teamId}&task=${i.id}` : `/student/courses/${i.courseId}`);

function ItemRow({ item }: { item: WeekItem }) {
  const due = dueInfo(item.date);
  const Icon = item.kind === "task" ? CheckSquare : Flag;
  return (
    <Link href={hrefOf(item)} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 outline-none">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", item.kind === "task" ? "bg-peach text-warm-text" : "bg-butter text-warm-text")}>
        <Icon weight="fill" className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold group-hover:text-primary">
          {item.kind === "milestone" && <span className="text-muted-foreground">Milestone · </span>}{item.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.teamName} · {item.courseCode}</span>
      </span>
      {item.priority && <Badge variant={priorityBadge[item.priority]} className="hidden capitalize sm:inline-flex">{item.priority}</Badge>}
      {due && <span className={cn("w-28 shrink-0 text-right text-xs font-semibold", toneText[due.tone])}>{due.label}</span>}
    </Link>
  );
}

const LIST_DAYS = 21;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Month grid (weeks start Monday). Items sit on their due date; phones get dots instead of titles. */
function MonthView({ items }: { items: WeekItem[] }) {
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
        <h2 className="flex-1 text-base font-bold" aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} aria-label="Previous month"><CaretLeft aria-hidden /></Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} aria-label="Next month"><CaretRight aria-hidden /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <li key={i} aria-hidden className="min-h-14 sm:min-h-24" />;
          const list = byDay.get(date) ?? [];
          const late = date < today;
          return (
            <li key={date} className={cn("flex min-h-14 flex-col gap-1 rounded-xl p-1 sm:min-h-24 sm:p-1.5", date === today ? "bg-primary/8 ring-1 ring-primary/30" : "bg-muted/40")}
              aria-label={`${new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} due` : ""}`}>
              <span className={cn("text-xs font-bold tabular-nums", date === today ? "text-primary" : "text-muted-foreground")}>{Number(date.slice(8))}</span>
              {/* Phones: one dot per item */}
              {list.length > 0 && (
                <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                  {list.slice(0, 4).map((x) => <span key={`${x.kind}-${x.id}-${x.teamId}`} className={cn("size-1.5 rounded-full", late ? "bg-destructive" : x.kind === "task" ? "bg-primary" : "bg-info")} />)}
                </span>
              )}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {list.slice(0, 3).map((x) => (
                  <Link key={`${x.kind}-${x.id}-${x.teamId}`} href={hrefOf(x)} title={`${x.title} · ${x.teamName}`}
                    className={cn("truncate rounded-md px-1.5 py-0.5 text-left text-[0.6875rem] font-semibold outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
                      late ? "bg-rose text-destructive" : x.kind === "task" ? "bg-peach text-warm-text" : "bg-sky text-info")}>
                    {x.kind === "milestone" && <Flag weight="fill" className="mr-0.5 inline size-2.5" aria-hidden />}{x.title}
                  </Link>
                ))}
                {list.length > 3 && <span className="px-1.5 text-[0.6875rem] font-semibold text-muted-foreground">+{list.length - 3} more</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Your tasks</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />Milestones</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />Overdue</span>
      </p>
    </Card>
  );
}

/** Every dated thing a student owes, across all their teams, grouped by when it is due. */
export function MyWeek() {
  const [all, setAll] = React.useState<WeekItem[] | null>(null);
  const [view, setView] = React.useState<"list" | "month">("list");
  const items = React.useMemo(() => all?.filter((i) => daysUntil(i.date) <= LIST_DAYS) ?? null, [all]);
  React.useEffect(() => {
    getMyWeek().then(setAll).catch((err) => { console.error("Loading your week failed:", err); setAll([]); });
  }, []);

  const groups = React.useMemo(() => {
    const out: { label: string; items: WeekItem[] }[] = [];
    for (const i of items ?? []) {
      const label = weekBucket(i.date);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(i); else out.push({ label, items: [i] });
    }
    return out;
  }, [items]);

  const overdue = groups.find((g) => g.label === "Overdue")?.items.length ?? 0;
  const thisWeek = (items ?? []).filter((i) => weekBucket(i.date) !== "Next week" && weekBucket(i.date) !== "Later").length;

  return (
    <Page>
      <PageHeader title="My week"
        description={!items ? " " : items.length === 0 ? "Nothing dated is waiting on you." : `${thisWeek} due this week${overdue ? `, ${overdue} overdue` : ""}, across all your teams.`}>
        <div className="flex items-center gap-2">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "month", label: "Month" }]} />
          <Button variant="outline" asChild>
            <a href="/api/calendar" download title="Add your due dates to Google Calendar, Outlook or Apple Calendar"><DownloadSimple aria-hidden /><span className="hidden sm:inline">Export .ics</span><span className="sm:hidden">.ics</span></a>
          </Button>
        </div>
      </PageHeader>
      {all && view === "month" ? (
        <MonthView items={all} />
      ) : !items ? (
        <Card className="space-y-3 p-5" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={CalendarCheck} title="You're all caught up" description="Tasks assigned to you with a due date, and your teams' milestones, show up here." /></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} aria-labelledby={`week-${g.label}`}>
              <h2 id={`week-${g.label}`} className={cn("mb-2 flex items-center gap-2 text-sm font-bold", g.label === "Overdue" && "text-destructive")}>
                {g.label}<span className="font-semibold text-muted-foreground">{g.items.length}</span>
              </h2>
              <Card className="divide-y overflow-hidden">
                {g.items.map((i) => <ItemRow key={`${i.kind}-${i.id}-${i.teamId}`} item={i} />)}
              </Card>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
