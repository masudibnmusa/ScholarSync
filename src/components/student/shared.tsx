"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, Check, Clock, Quotes, Sparkle, UsersThree, X } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn, healthInfo, toneText } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/** The selected team plus whether the first load has finished (to tell "loading" from "no team"). */
export function useTeam() {
  const team = useAppStore((s) => s.selectedTeam);
  const loaded = useAppStore((s) => s.loaded.teams);
  return { team, loaded };
}

/** The team's avatars; pressing them lists every member with skills, availability and share of finished tasks. */
export function MembersButton({ team, align = "start" }: { team: Team; align?: "start" | "end" }) {
  const user = useUser();
  const health = healthInfo(team.healthScore);
  const n = team.members.length;
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-2 rounded-full p-1 pr-2.5 transition-colors hover:bg-accent data-[state=open]:bg-accent" aria-label={`${n} team ${n === 1 ? "member" : "members"}. Show all`}>
        <AvatarStack names={team.members.map((m) => m.name)} />
        <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">{n}</span>
        <CaretDown weight="bold" className="size-3 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-bold">{team.name} · {n} {n === 1 ? "member" : "members"}</p>
          <span className={cn("text-xs font-semibold", toneText[health.tone])}>{health.label}</span>
        </div>
        {n === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="max-h-[min(26rem,60dvh)] divide-y overflow-y-auto scroll-thin">
            {team.members.map((m) => {
              const me = m.userId === user.id;
              return (
                <li key={m.userId} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}{me && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
                      {m.availability && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Clock className="size-3 shrink-0" aria-hidden />{m.availability}</p>}
                    </div>
                    <span className="text-sm font-bold tabular-nums">{m.contribution}%</span>
                  </div>
                  <Progress value={m.contribution} label={`${m.name}: share of completed tasks`} color={me ? "var(--warm)" : "var(--primary)"} className="mt-2 h-1.5" />
                  {m.skills.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1" aria-label={`${m.name}'s skills`}>
                      {m.skills.slice(0, 4).map((sk) => <li key={sk} className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{sk}</li>)}
                      {m.skills.length > 4 && <li className="px-1 py-0.5 text-[0.6875rem] text-muted-foreground">+{m.skills.length - 4}</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">% is each member&apos;s share of the team&apos;s completed tasks.</p>
      </PopoverContent>
    </Popover>
  );
}

export function NoTeam() {
  return (
    <EmptyState
      icon={UsersThree}
      title="You're not on a team yet"
      description="Your instructor forms the teams for each course. Once you're placed, your chat, board and files appear here. Meanwhile, fill in your profile so matching works well."
    >
      <Button asChild><Link href="/student/profile">Complete your profile</Link></Button>
    </EmptyState>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-80" />
    </div>
  );
}

/** Tasks the AI job extracted from chat. A person accepts or dismisses each one. */
export function AiSuggestionsButton() {
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
          <span className="hidden xl:inline">AI suggestions</span>
          <span className="xl:hidden">AI</span>
          {count > 0 && <span className="rounded-full bg-warm-foreground/15 px-1.5 text-xs font-extrabold tabular-nums">{count}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-warm/15 text-warm-text"><Sparkle weight="fill" className="size-4" aria-hidden /></span>
            Tasks found in your chat
          </DialogTitle>
          <DialogDescription>The AI reads new team messages and suggests tasks. Nothing is added until you say so.</DialogDescription>
        </DialogHeader>

        {count === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold">No suggestions right now</p>
            <p className="mt-1 text-sm text-muted-foreground">Keep chatting. When someone says "I'll do X by Friday", it shows up here.</p>
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
                    <Button size="sm" loading={busy === s.id} onClick={() => act(s.id, accept)}><Check weight="bold" aria-hidden /> Add to board</Button>
                    <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => act(s.id, dismiss)}><X aria-hidden /> Dismiss</Button>
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
