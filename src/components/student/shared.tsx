"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getWeeklySummary, refreshWeeklySummary, suggestMeetingTimes } from "@/app/actions";
import { proposalMessage, slotLabel, type MeetingSlot } from "@/lib/meeting";
import { AnimatePresence, motion } from "motion/react";
import { ArrowClockwise, CalendarPlus, CaretDown, ChatTeardropText, Check, CheckCircle, ClipboardText, Clock, Quotes, Sparkle, UsersThree, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useAppStore, useLive } from "@/lib/store";
import { cn, firstName, healthInfo, timeAgo, toneText } from "@/lib/utils";
import type { Team, WeeklySummary } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import {intl, t, num } from "@/lib/i18n";

/** The selected team plus whether the first load has finished (to tell "loading" from "no team"). */
export function useTeam() {
  const team = useAppStore((s) => s.selectedTeam);
  const loaded = useAppStore((s) => s.loaded.teams);
  return { team, loaded };
}

/** The team's avatars; pressing them lists every member with skills, availability and share of finished tasks. */
export function MembersButton({ team, align = "start" }: { team: Team; align?: "start" | "end" }) {
  const { t, tn } = useT();
  const user = useUser();
  const health = healthInfo(team.healthScore);
  const n = team.members.length;
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-2 rounded-full p-1 pr-2.5 transition-colors hover:bg-accent data-[state=open]:bg-accent" aria-label={tn(n, "{n} team member. Show all", "{n} team members. Show all")}>
        <AvatarStack people={team.members.map((m) => ({ id: m.userId, name: m.name }))} />
        <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">{num(n)}</span>
        <CaretDown weight="bold" className="size-3 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-bold">{team.name} · {num(n)} {n === 1 ? t("member") : t("members")}</p>
          <span className={cn("text-xs font-semibold", toneText[health.tone])}>{health.label}</span>
        </div>
        {n === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("No members yet.")}</p>
        ) : (
          <ul className="max-h-[min(26rem,60dvh)] divide-y overflow-y-auto scroll-thin">
            {team.members.map((m) => {
              const me = m.userId === user.id;
              return (
                <li key={m.userId} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} id={m.userId} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}{me && <span className="font-normal text-muted-foreground"> {t("(you)")}</span>}</p>
                      {m.availability && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Clock className="size-3 shrink-0" aria-hidden />{m.availability}</p>}
                    </div>
                    <span className="text-sm font-bold tabular-nums">{num(m.contribution)}%</span>
                  </div>
                  <Progress value={m.contribution} label={t("{name}: share of completed tasks", { name: m.name })} color={me ? "var(--warm)" : "var(--primary)"} className="mt-2 h-1.5" />
                  {m.skills.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("{name}'s skills", { name: m.name })}>
                      {m.skills.slice(0, 4).map((sk) => <li key={sk} className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{sk}</li>)}
                      {m.skills.length > 4 && <li className="px-1 py-0.5 text-[0.6875rem] text-muted-foreground">+{num(m.skills.length - 4)}</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">{t("% is each member's share of the team's completed tasks.")}</p>
      </PopoverContent>
    </Popover>
  );
}

export function NoTeam() {
  const { t } = useT();
  return (
    <EmptyState
      icon={UsersThree}
      title={t("You're not on a team yet")}
      description={t("Your instructor forms the teams for each course. Once you're placed, your chat, board and files appear here. Meanwhile, fill in your profile so matching works well.")}
    >
      <Button asChild><Link href="/student/profile">{t("Complete your profile")}</Link></Button>
    </EmptyState>
  );
}

export function PanelSkeleton() {
  const { t } = useT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t("Loading")}>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-80" />
    </div>
  );
}

/** Tasks the AI job extracted from chat. A person accepts or dismisses each one. */
function RecapList({ icon: IconCmp, title, items, tone }: { icon: Icon; title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-sm font-bold"><IconCmp weight="fill" className={cn("size-4", tone)} aria-hidden />{title}</h3>
      <ul className="mt-1.5 space-y-1 pl-5.5 text-sm text-muted-foreground">
        {items.map((x) => <li key={x} className="list-disc marker:text-border">{x}</li>)}
      </ul>
    </section>
  );
}

export const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(intl(), { day: "numeric", month: "short", timeZone: "UTC" });

/** The team's weekly AI recap. Opens from the header, or from a notification link with ?recap=1. */
export function WeeklyRecapButton({ team }: { team: Team }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromLink = params.get("recap") === "1";
  const [open, setOpen] = React.useState(false);
  const [recap, setRecap] = React.useState<WeeklySummary | null | undefined>(undefined); // undefined = loading
  const [refreshing, setRefreshing] = React.useState(false);
  const isOpen = open || fromLink;
  const live = useLive("team_summaries");

  React.useEffect(() => {
    if (!isOpen) return;
    getWeeklySummary(team.id).then(setRecap).catch((err) => {
      console.error("Loading the recap failed:", err);
      setRecap(null);
    });
  }, [isOpen, team.id, live]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && fromLink) {
      const rest = new URLSearchParams(params.toString());
      rest.delete("recap");
      router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const result = await refreshWeeklySummary(team.id);
      if (result === "quiet") toast.info(t("Not much happened this week yet. Try again after some chat or board activity."));
      else if (result === "cooldown") toast.info(t("This recap was made a few minutes ago."));
      setRecap(await getWeeklySummary(team.id));
    } catch (err) {
      console.error("Refreshing the recap failed:", err);
      toast.error(t("Could not write the recap. The AI may be busy; try again in a minute."));
    }
    setRefreshing(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={t("Weekly recap")}>
          <ClipboardText weight="duotone" aria-hidden />
          <span className="hidden xl:inline">{t("Weekly recap")}</span>
          <span className="hidden sm:inline xl:hidden">{t("Recap")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-sky text-info"><ClipboardText weight="fill" className="size-4" aria-hidden /></span>
            {team.name}{t("'s weekly recap")}
          </DialogTitle>
          <DialogDescription>
            {recap ? t("Week of {week} · written by AI {when}", { week: weekLabel(recap.weekStart), when: timeAgo(recap.generatedAt) }) : t("Every Monday the AI reads the week's chat and board and sums it up.")}
          </DialogDescription>
        </DialogHeader>
        {recap === undefined ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
        ) : recap === null ? (
          <EmptyState icon={ClipboardText} title={t("No recap yet")} description={t("The first one arrives on Monday, or write one now from this week's activity.")} className="py-6" />
        ) : (
          <div className="space-y-4">
            <p className="rounded-2xl bg-sky/60 px-4 py-3 text-[0.9375rem] leading-relaxed">{recap.summary}</p>
            <RecapList icon={CheckCircle} title={t("Done")} items={recap.done} tone="text-success" />
            <RecapList icon={WarningCircle} title={t("Late or at risk")} items={recap.late} tone="text-warning" />
            <RecapList icon={ChatTeardropText} title={t("Decided")} items={recap.decisions} tone="text-info" />
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={refresh} loading={refreshing} disabled={recap === undefined}>
            {!refreshing && <ArrowClockwise aria-hidden />} {recap ? t("Refresh from this week") : t("Write it now")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AI reads everyone's availability and suggests times; picking one posts a proposal to the team chat. */
export function MeetingButton({ team }: { team: Team }) {
  const { t } = useT();
  const sendMessage = useAppStore((s) => s.sendMessage);
  const [open, setOpen] = React.useState(false);
  const [slots, setSlots] = React.useState<MeetingSlot[] | null | undefined>(undefined); // undefined = not asked, null = loading
  const [posting, setPosting] = React.useState<string | null>(null);

  async function find() {
    setSlots(null);
    try {
      setSlots(await suggestMeetingTimes(team.id));
    } catch (err) {
      console.error("Suggesting meeting times failed:", err);
      toast.error(t("Could not suggest times. The AI may be busy; try again in a minute."));
      setSlots(undefined);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && slots === undefined) find();
  }

  async function propose(s: MeetingSlot) {
    setPosting(s.date + s.start);
    if (await sendMessage(team.id, proposalMessage(s, team.members.length))) {
      toast.success(t("Proposal posted to the team chat"));
      setOpen(false);
    }
    setPosting(null);
  }

  const unknown = team.members.filter((m) => !m.availability.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={t("Find a time to meet")}>
          <CalendarPlus weight="duotone" aria-hidden />
          <span className="hidden xl:inline">{t("Find a time")}</span>
          <span className="hidden sm:inline xl:hidden">{t("Meet")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-butter text-warm-text"><CalendarPlus weight="fill" className="size-4" aria-hidden /></span>
            {t("Find a meeting time")}
          </DialogTitle>
          <DialogDescription>{t("The AI matches everyone's availability from their profiles. Pick a time to propose it in the team chat.")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-wrap gap-1.5" aria-label={t("Member availability")}>
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-xs">
              <Avatar name={m.name} id={m.userId} size="xs" /><span className="font-semibold">{firstName(m.name)}</span>
              <span className="text-muted-foreground">{m.availability.trim() || t("not set")}</span>
            </li>
          ))}
        </ul>
        {slots === null || slots === undefined ? (
          <div className="space-y-2" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : slots.length === 0 ? (
          <EmptyState icon={CalendarPlus} title={t("No good time found")} description={t("Ask teammates to add their availability on their profile, then try again.")} className="py-6" />
        ) : (
          <ul className="space-y-2">
            {slots.map((s, i) => {
              const all = s.attendees.length >= team.members.length;
              return (
                <li key={s.date + s.start} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3", i === 0 && "border-primary/30 bg-primary/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-bold">{slotLabel(s)}</p>
                    <p className={cn("text-xs font-semibold", all ? "text-success" : "text-warm-text")}>
                      {all ? t("Works for everyone") : `${s.attendees.length} of ${team.members.length}: ${s.attendees.map(firstName).join(", ") || "unclear"}`}
                    </p>
                    {s.note && <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>}
                  </div>
                  <Button size="sm" variant={i === 0 ? "default" : "secondary"} loading={posting === s.date + s.start} disabled={!!posting} onClick={() => propose(s)}>
                    {t("Propose")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{unknown.length ? t("{count} without availability, treated as flexible.", { count: unknown.length }) : t("Check the time with everyone in chat.")}</p>
          <Button variant="ghost" size="sm" onClick={find} disabled={slots === null}><ArrowClockwise aria-hidden />{t("Try again")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AiSuggestionsButton() {
  const { t } = useT();
  const suggestions = useAppStore((s) => s.taskSuggestions);
  const accept = useAppStore((s) => s.acceptSuggestion);
  const dismiss = useAppStore((s) => s.dismissSuggestion);
  const [busy, setBusy] = React.useState<string | null>(null);
  const count = suggestions.length;

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    await fn(id);
    setBusy(null);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={count ? "warm" : "outline"} className="relative">
          <Sparkle weight="fill" aria-hidden />
          <span className="hidden xl:inline">{t("AI suggestions")}</span>
          <span className="xl:hidden">{t("AI")}</span>
          {count > 0 && <span className="rounded-full bg-warm-foreground/15 px-1.5 text-xs font-extrabold tabular-nums">{num(count)}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-warm/15 text-warm-text"><Sparkle weight="fill" className="size-4" aria-hidden /></span>
            {t("Tasks found in your chat")}
          </DialogTitle>
          <DialogDescription>{t("The AI reads new team messages and suggests tasks. Nothing is added until you say so.")}</DialogDescription>
        </DialogHeader>

        {count === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold">{t("No suggestions right now")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("Keep chatting. When someone says \"I'll do X by Friday\", it shows up here.")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {suggestions.map((s) => (
                <motion.li key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }}
                  className="rounded-2xl border bg-card p-4">
                  <p className="font-bold leading-snug">{s.title}</p>
                  {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                  {s.source && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-muted px-3 py-2 text-xs italic text-muted-foreground">
                      <Quotes weight="fill" className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="line-clamp-2">{s.source}</span>
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" loading={busy === s.id} onClick={() => act(s.id, accept)}><Check weight="bold" aria-hidden /> {t("Add to board")}</Button>
                    <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => act(s.id, dismiss)}><X aria-hidden /> {t("Dismiss")}</Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
