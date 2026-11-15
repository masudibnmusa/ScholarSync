"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Quotes, Sparkle, UsersThree, X } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/** The selected team plus whether the first load has finished (to tell "loading" from "no team"). */
export function useTeam() {
  const team = useAppStore((s) => s.selectedTeam);
  const loaded = useAppStore((s) => s.loaded.teams);
  return { team, loaded };
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
