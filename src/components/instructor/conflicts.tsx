"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle, ShieldCheck, Smiley, SmileyMeh, SmileySad, Warning } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { ConflictAlert } from "@/lib/types";
import { EmptyState, Page, PageHeader, StatCard } from "@/components/app/page";
import { severityBadge } from "@/components/instructor/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";

const severityBar = { high: "bg-destructive", medium: "bg-warning", low: "bg-info" } as const;
const severityRank = { high: 0, medium: 1, low: 2 } as const;

/** Chat tone from the AI check, -1 (hostile) to 1 (positive), on a diverging scale with a neutral middle. */
function Sentiment({ score }: { score: number }) {
  const pct = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100;
  const mood = score <= -0.25 ? { label: "Tense", icon: SmileySad, cls: "text-destructive" } : score < 0.25 ? { label: "Neutral", icon: SmileyMeh, cls: "text-muted-foreground" } : { label: "Positive", icon: Smiley, cls: "text-success" };
  return (
    <div className="w-full sm:w-52">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Chat tone</span>
        <span className={cn("inline-flex items-center gap-1 font-bold", mood.cls)}><mood.icon weight="fill" className="size-4" aria-hidden />{mood.label} <span className="tabular-nums text-muted-foreground">({score > 0 ? "+" : ""}{score.toFixed(2)})</span></span>
      </div>
      <div role="meter" aria-label="Chat tone" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={score} aria-valuetext={`${mood.label}, ${score.toFixed(2)}`} className="relative h-2 rounded-full bg-gradient-to-r from-destructive/70 via-muted to-success/70">
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/50" aria-hidden />
        <motion.span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-soft" initial={{ left: "50%" }} animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: ConflictAlert }) {
  const resolve = useAppStore((s) => s.resolveConflict);
  const [busy, setBusy] = React.useState(false);
  const sev = alert.severity as keyof typeof severityBadge;
  return (
    <Card className={cn("relative overflow-hidden", alert.isResolved && "opacity-75")}>
      <span className={cn("absolute inset-y-0 left-0 w-1.5", alert.isResolved ? "bg-success" : severityBar[sev] ?? "bg-muted-foreground")} aria-hidden />
      <div className="flex flex-col gap-4 p-5 pl-6 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold">{alert.teamName}</h2>
            {alert.isResolved
              ? <Badge variant="success"><CheckCircle weight="fill" aria-hidden />Resolved</Badge>
              : <Badge variant={severityBadge[sev] ?? "muted"} className="capitalize"><Warning weight="fill" aria-hidden />{alert.severity} severity</Badge>}
            <time dateTime={alert.createdAt} className="text-xs text-muted-foreground">{timeAgo(alert.createdAt)}</time>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{alert.description}</p>
        </div>
        <Sentiment score={alert.sentimentScore} />
        <div className="flex shrink-0 gap-2 lg:flex-col">
          <Button asChild variant="outline" size="sm"><Link href={`/instructor?team=${alert.teamId}`}>Open team <ArrowRight aria-hidden /></Link></Button>
          {!alert.isResolved && (
            <Button size="sm" loading={busy} onClick={async () => { setBusy(true); await resolve(alert.id); toast.success("Alert resolved", { description: alert.teamName }); }}>
              <Check weight="bold" aria-hidden /> Mark resolved
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ConflictsPanel() {
  const alerts = useAppStore((s) => s.conflictAlerts);
  const loaded = useAppStore((s) => s.loaded.conflicts);
  const [filter, setFilter] = React.useState<"open" | "resolved" | "all">("open");

  const open = alerts.filter((a) => !a.isResolved);
  const visible = (filter === "all" ? alerts : alerts.filter((a) => a.isResolved === (filter === "resolved")))
    .slice()
    .sort((a, b) => Number(a.isResolved) - Number(b.isResolved) || (severityRank[a.severity as keyof typeof severityRank] ?? 3) - (severityRank[b.severity as keyof typeof severityRank] ?? 3));

  return (
    <Page>
      <PageHeader title="Conflicts" description="Each night the AI reads team chats for signs of friction or silence. You decide what to do about it." />

      <Stagger className="grid grid-cols-3 gap-3 sm:gap-4">
        <StaggerItem><StatCard icon={Warning} label="Open" compact value={open.length} tone={open.length ? "danger" : "primary"} /></StaggerItem>
        <StaggerItem><StatCard icon={Warning} label="High severity" compact value={open.filter((a) => a.severity === "high").length} tone="warm" /></StaggerItem>
        <StaggerItem><StatCard icon={CheckCircle} label="Resolved" compact value={alerts.length - open.length} tone="success" /></StaggerItem>
      </Stagger>

      <Segmented label="Filter alerts" value={filter} onChange={setFilter} options={[{ value: "open", label: `Open (${open.length})` }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }]} />

      {!loaded ? (
        <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck}
            title={filter === "resolved" ? "No resolved alerts yet" : "No open conflicts"}
            description={filter === "resolved" ? "Alerts you mark as resolved are kept here for reference." : "Every team's conversation looks constructive. New alerts appear here after the nightly check."}>
            {filter === "open" && alerts.length > 0 && <Button variant="outline" onClick={() => setFilter("resolved")}>View resolved</Button>}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((a) => (
              <motion.li key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.3 }}>
                <AlertCard alert={a} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Page>
  );
}
