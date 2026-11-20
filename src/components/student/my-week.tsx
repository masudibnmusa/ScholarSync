"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CheckSquare, Flag } from "@phosphor-icons/react/dist/ssr";
import { getMyWeek } from "@/app/actions";
import { cn, dueInfo, toneText, weekBucket } from "@/lib/utils";
import type { WeekItem } from "@/lib/types";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
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

/** Every dated thing a student owes, across all their teams, grouped by when it is due. */
export function MyWeek() {
  const [items, setItems] = React.useState<WeekItem[] | null>(null);
  React.useEffect(() => {
    getMyWeek().then(setItems).catch((err) => { console.error("Loading your week failed:", err); setItems([]); });
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
        description={!items ? " " : items.length === 0 ? "Nothing dated is waiting on you." : `${thisWeek} due this week${overdue ? `, ${overdue} overdue` : ""}, across all your teams.`} />
      {!items ? (
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
