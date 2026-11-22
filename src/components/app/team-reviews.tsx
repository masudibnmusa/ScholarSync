"use client";

import * as React from "react";
import { Flag, Star, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { getTeamReviews } from "@/app/actions";
import { cn, timeAgo } from "@/lib/utils";
import type { TeamReview } from "@/lib/types";
import { EmptyState } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";
import { useT } from "@/components/locale";
import { msg, num } from "@/lib/i18n";

const flagText: Record<TeamReview["flags"][number], string> = {
  "far-from-others": msg("Far from other ratings"),
  "all-lowest": msg("Gave everyone 1★"),
};

function Stars({ n }: { n: number }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={t("{n} out of 5", { n })}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} weight="fill" className={cn("size-3.5", i <= n ? "text-warning" : "text-muted-foreground/25")} aria-hidden />)}
    </span>
  );
}

/** What teammates said about each other, with reviews that may be unfair flagged for a second look. */
export function TeamReviews({ teamId }: { teamId: string }) {
  const { t } = useT();
  const [reviews, setReviews] = React.useState<TeamReview[] | null>(null);
  const live = useLive("peer_reviews");
  React.useEffect(() => {
    getTeamReviews(teamId).then(setReviews).catch((err) => {
      console.error("Loading peer reviews failed:", err);
      setReviews([]);
    });
  }, [teamId, live]);

  const groups = React.useMemo(() => {
    const by = new Map<string, TeamReview[]>();
    for (const r of reviews ?? []) by.set(r.revieweeId, [...(by.get(r.revieweeId) ?? []), r]);
    return [...by.values()];
  }, [reviews]);
  const flagged = reviews?.filter((r) => r.flags.length).length ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold"><UserFocus weight="duotone" className="size-5 text-primary" aria-hidden />{t("Peer reviews")}</h2>
        {reviews && reviews.length > 0 && <span className="text-sm text-muted-foreground">{num(reviews.length)} {t("written")}</span>}
        {flagged > 0 && <Badge variant="warning" className="ml-auto"><Flag weight="fill" aria-hidden />{num(flagged)} {t("to check")}</Badge>}
      </div>
      {!reviews ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : !reviews.length ? (
        <EmptyState icon={UserFocus} title={t("No peer reviews yet")} description={t("When teammates review each other, you'll see the ratings and comments here.")} className="py-6" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const avg = g.reduce((n, r) => n + r.rating, 0) / g.length;
            return (
              <section key={g[0].revieweeId} aria-label={t("Reviews of {revieweeName}", { revieweeName: g[0].revieweeName })} className="rounded-2xl bg-muted/50 p-3">
                <header className="mb-2 flex items-center gap-2">
                  <Avatar name={g[0].revieweeName} id={g[0].revieweeId} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{g[0].revieweeName}</p>
                  <span className="text-sm font-extrabold tabular-nums">{num(avg, 1)}<span className="font-semibold text-muted-foreground"> {t("avg")}</span></span>
                </header>
                <ul className="space-y-1.5">
                  {g.map((r) => (
                    <li key={r.id} className={cn("rounded-xl bg-card px-3 py-2", r.flags.length && "ring-1 ring-warning/40")}>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold">{t("from {name}", { name: r.reviewerName })}</span>
                        <Stars n={r.rating} />
                        <time dateTime={r.createdAt} className="text-muted-foreground">{timeAgo(r.createdAt)}</time>
                        {r.flags.map((f) => <Badge key={f} variant="warning" className="text-[0.6875rem]"><Flag weight="fill" aria-hidden />{t(flagText[f])}</Badge>)}
                      </p>
                      {r.feedback && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.feedback}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
