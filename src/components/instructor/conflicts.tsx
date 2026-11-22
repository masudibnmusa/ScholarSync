"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, ChatsCircle, Check, CheckCircle, Clock, Funnel, Lightbulb, Scroll, ShieldCheck, ShieldWarning, Smiley, SmileyMeh, SmileySad, Warning, WarningCircle, WarningOctagon, X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { ConflictAlert } from "@/lib/types";
import { EmptyState, Page } from "@/components/app/page";
import { HealthBadge } from "@/components/instructor/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedNumber, EASE } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientValue } from "@/hooks/use-client";
import { useT } from "@/components/locale";
import {intl, msg } from "@/lib/i18n";

type Severity = "high" | "medium" | "low";
const SEVERITY: Record<Severity, { label: string; icon: Icon; badge: "danger" | "warning" | "info"; tile: string; bar: string; hero: string }> = {
  high: { label: msg("High"), icon: WarningOctagon, badge: "danger", tile: "bg-destructive/12 text-destructive", bar: "bg-destructive", hero: "var(--rose-strong)" },
  medium: { label: msg("Medium"), icon: Warning, badge: "warning", tile: "bg-warning/14 text-warning", bar: "bg-warning", hero: "var(--butter-strong)" },
  low: { label: msg("Low"), icon: WarningCircle, badge: "info", tile: "bg-info/12 text-info", bar: "bg-info", hero: "var(--sky-strong)" },
};
const sevOf = (a: ConflictAlert) => SEVERITY[a.severity as Severity] ?? SEVERITY.low;
const rank = (a: ConflictAlert) => ({ high: 0, medium: 1, low: 2 })[a.severity as Severity] ?? 3;

/** Next run of the nightly AI check (cron 0 2 * * *, server time), shown in the viewer's time. */
function nextCheckLabel() {
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.toLocaleTimeString(intl(), { hour: "numeric", minute: "2-digit" });
}

/** Chat tone from the AI check, -1 (hostile) to 1 (positive), on a diverging scale with a neutral middle. */
function Tone({ score }: { score: number }) {
  const { t } = useT();
  const pct = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100;
  const mood = score <= -0.25 ? { label: t("Tense"), icon: SmileySad, cls: "text-destructive" } : score < 0.25 ? { label: t("Neutral"), icon: SmileyMeh, cls: "text-muted-foreground" } : { label: t("Positive"), icon: Smiley, cls: "text-success" };
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-bold", mood.cls)}><mood.icon weight="fill" className="size-4" aria-hidden />{mood.label}</span>
      <div role="meter" aria-label={t("Chat tone")} aria-valuemin={-1} aria-valuemax={1} aria-valuenow={score} aria-valuetext={`${mood.label}, ${score.toFixed(2)}`}
        className="relative h-1.5 w-24 shrink-0 rounded-full bg-gradient-to-r from-destructive/70 via-muted to-success/70 sm:w-32">
        <span className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-muted-foreground/50" aria-hidden />
        <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-soft"
          initial={{ left: "50%" }} animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{score > 0 ? "+" : ""}{score.toFixed(2)}</span>
    </div>
  );
}

function AlertCard({ alert }: { alert: ConflictAlert }) {
  const { t } = useT();
  const resolve = useAppStore((s) => s.resolveConflict);
  const [busy, setBusy] = React.useState(false);
  const sev = sevOf(alert);
  const SevIcon = alert.isResolved ? CheckCircle : sev.icon;
  return (
    <Card className={cn("group relative overflow-hidden transition-[box-shadow,border-color] duration-300 hover:shadow-lift", alert.isResolved ? "bg-card/70" : "hover:border-primary/25")}>
      <div className="flex gap-4 p-5">
        <span className={cn("hidden size-11 shrink-0 items-center justify-center rounded-2xl sm:flex", alert.isResolved ? "bg-success/12 text-success" : sev.tile)}>
          <SevIcon weight="fill" className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-extrabold">{alert.teamName}</h3>
            {alert.isResolved
              ? <Badge variant="success">{t("Resolved")}</Badge>
              : <Badge variant={sev.badge}>{t("{level} severity", { level: t(sev.label) })}</Badge>}
            <time dateTime={alert.createdAt} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" aria-hidden />{timeAgo(alert.createdAt)}</time>
          </div>

          {/* The AI's summary of the chat, set apart as a quote */}
          <blockquote className={cn("mt-3 rounded-xl border-l-[3px] bg-muted/50 px-4 py-3 text-[0.9375rem] leading-relaxed", alert.isResolved ? "border-success/50 text-muted-foreground" : "border-primary/40")}>
            {alert.description}
          </blockquote>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Tone score={alert.sentimentScore} />
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="ghost" size="sm"><Link href={`/instructor?team=${alert.teamId}&charter=1`}><Scroll aria-hidden /> {t("Team charter")}</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link href={`/instructor?team=${alert.teamId}&view=chat`}><ChatsCircle aria-hidden /> {t("Message team")}</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={`/instructor?team=${alert.teamId}`}>{t("Open team")} <ArrowRight aria-hidden /></Link></Button>
              {!alert.isResolved && (
                <Button size="sm" loading={busy} onClick={async () => { setBusy(true); await resolve(alert.id); toast.success(t("Alert resolved"), { description: alert.teamName }); }}>
                  {!busy && <Check weight="bold" aria-hidden />} {t("Mark resolved")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function HeroStat({ label, value, swatch }: { label: string; value: number; swatch?: string }) {
  return (
    <div className="rounded-2xl border border-glass-border bg-glass px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {swatch && <span className="size-2 rounded-full" style={{ backgroundColor: swatch }} aria-hidden />}{label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground"><AnimatedNumber value={value} /></p>
    </div>
  );
}

export function ConflictsPanel() {
  const { t, tn } = useT();
  const alerts = useAppStore((s) => s.conflictAlerts);
  const loaded = useAppStore((s) => s.loaded.conflicts);
  const teams = useAppStore((s) => s.teams);
  const [filter, setFilter] = React.useState<"open" | "resolved" | "all">("open");
  const [teamFilter, setTeamFilter] = React.useState<string | null>(null);
  const nextCheck = useClientValue<string | null>(nextCheckLabel, null); // local time: browser only

  const open = alerts.filter((a) => !a.isResolved);
  const counts = { high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const a of open) counts[(a.severity as Severity) in counts ? (a.severity as Severity) : "low"]++;
  const resolved = alerts.length - open.length;
  const teamName = teams.find((tt) => tt.id === teamFilter)?.name ?? alerts.find((a) => a.teamId === teamFilter)?.teamName;

  const visible = alerts
    .filter((a) => (filter === "all" || a.isResolved === (filter === "resolved")) && (!teamFilter || a.teamId === teamFilter))
    .sort((a, b) => Number(a.isResolved) - Number(b.isResolved) || rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));

  // Teams for the sidebar: the ones with open alerts first.
  const openFor = (id: string) => open.filter((a) => a.teamId === id).length;
  const teamRows = [...teams].sort((a, b) => openFor(b.id) - openFor(a.id) || a.healthScore - b.healthScore);

  const status = open.length === 0
    ? { title: t("All clear"), text: t("No open conflicts. Every team's conversation looks constructive."), icon: ShieldCheck, tile: "bg-success/25 text-success" }
    : { title: tn(open.length, "{n} open alert", "{n} open alerts"), text: counts.high ? t("{n} high severity. Start with {team}.", { n: counts.high, team: open.filter((a) => a.severity === "high")[0]?.teamName ?? t("those") }) : t("None are high severity."), icon: ShieldWarning, tile: "bg-warm/25 text-warm-text" };

  return (
    <Page className="space-y-8">
      {/* ── Hero: status, severity breakdown, next check ─────────────────────────── */}
      <motion.section
        aria-labelledby="conflicts-title"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-3xl bg-peach p-6 text-foreground shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_32%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-44 left-1/4 size-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--destructive)_22%,transparent),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.07]" aria-hidden />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-glass px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">
              <Clock weight="bold" className="size-3.5" aria-hidden /> {nextCheck ? t("Next AI check at {nextCheck}", { nextCheck }) : t("Nightly AI check")}
            </p>
            <h1 id="conflicts-title" className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{t("Conflicts")}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[0.9375rem]">{t("Each night the AI reads team chats for signs of friction or silence. You decide what to do about it.")}</p>

            <div className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-glass-border bg-glass p-4">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", status.tile)}><status.icon weight="fill" className="size-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{loaded ? status.title : t("Checking…")}</p>
                <p className="text-sm text-muted-foreground">{loaded ? status.text : t("Loading alerts.")}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Open alerts split by severity; labels below carry the numbers, not colour alone */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-glass" role="img"
              aria-label={t("Open alerts by severity: {high} high, {medium} medium, {low} low", { high: counts.high, medium: counts.medium, low: counts.low })}>
              {(["high", "medium", "low"] as Severity[]).map((k) => counts[k] > 0 && (
                <motion.span key={k} className="h-full border-r-2 border-peach last:border-r-0" style={{ backgroundColor: SEVERITY[k].hero }}
                  initial={{ width: 0 }} animate={{ width: `${(counts[k] / open.length) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <HeroStat label={t("High")} value={counts.high} swatch={SEVERITY.high.hero} />
              <HeroStat label={t("Medium")} value={counts.medium} swatch={SEVERITY.medium.hero} />
              <HeroStat label={t("Low")} value={counts.low} swatch={SEVERITY.low.hero} />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle weight="fill" className="size-3.5 text-success" aria-hidden />{resolved} {t("resolved so far")}</p>
          </div>
        </div>
      </motion.section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ── Alert list ───────────────────────────────────────────────────────────── */}
        <section aria-label={t("Alerts")} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={t("Filter alerts")} value={filter} onChange={setFilter}
              options={[{ value: "open", label: `Open (${open.length})` }, { value: "resolved", label: `Resolved (${resolved})` }, { value: "all", label: t("All") }]} />
            <AnimatePresence>
              {teamFilter && (
                <motion.button key="team-chip" type="button" onClick={() => setTeamFilter(null)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/70"
                  aria-label={t("Showing {teamName}. Clear team filter", { teamName })}>
                  <Funnel weight="fill" className="size-3.5" aria-hidden />{teamName}<X weight="bold" className="size-3.5" aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {!loaded ? (
            <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState icon={ShieldCheck}
                title={filter === "resolved" ? t("No resolved alerts yet") : teamFilter ? (filter === "open" ? t("No open alerts for {teamName}", { teamName }) : t("No alerts for {teamName}", { teamName })) : t("No open conflicts")}
                description={filter === "resolved" ? t("Alerts you mark as resolved are kept here for reference.") : t("Every conversation looks constructive. New alerts appear here after the nightly check.")}>
                {teamFilter && <Button variant="outline" onClick={() => setTeamFilter(null)}>{t("Show all teams")}</Button>}
                {!teamFilter && filter === "open" && resolved > 0 && <Button variant="outline" onClick={() => setFilter("resolved")}>{t("View resolved")}</Button>}
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((a) => (
                  <motion.li key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.3, ease: EASE }}>
                    <AlertCard alert={a} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* ── Sidebar: teams to filter by, and what to do ─────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <p className="border-b px-4 py-3 text-sm font-bold">{t("By team")}</p>
            <ul className="p-2">
              {teamRows.map((tt) => {
                const n = openFor(tt.id);
                const active = teamFilter === tt.id;
                return (
                  <li key={tt.id}>
                    <button type="button" onClick={() => setTeamFilter(active ? null : tt.id)} aria-pressed={active}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", active ? "bg-secondary" : "hover:bg-accent/60")}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar text-xs font-extrabold text-brand" aria-hidden>{tt.name.replace(/^team\s+/i, "").charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{tt.name}</span>
                        <HealthBadge score={tt.healthScore} />
                      </span>
                      {n > 0
                        ? <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-extrabold tabular-nums text-destructive-foreground">{n}<span className="sr-only"> {t("open")}</span></span>
                        : <CheckCircle weight="fill" className="size-5 text-success" aria-label={t("No open alerts")} />}
                    </button>
                  </li>
                );
              })}
              {teamRows.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{t("No teams yet.")}</li>}
            </ul>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Lightbulb weight="duotone" className="size-5 text-warm-text" aria-hidden />{t("What to do")}</p>
            <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {[t("Read the summary and the chat tone."), t("Message the team or open its workspace to see the chat and tasks."), t("Mark it resolved once you've stepped in.")].map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-extrabold text-secondary-foreground">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
