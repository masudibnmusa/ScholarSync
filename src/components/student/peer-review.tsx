"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, LockKey, PaperPlaneTilt, Star, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { getMyReviews } from "@/app/actions";
import { useAppStore, useLive } from "@/lib/store";
import { cn, firstName, timeAgo } from "@/lib/utils";
import type { MyReview } from "@/lib/types";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { NoTeam, PanelSkeleton, useTeam } from "@/components/student/shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { EASE } from "@/components/ui/motion";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/components/locale";
import { t, msg } from "@/lib/i18n";

const categories = [
  { key: "comm", label: msg("Communication"), hint: msg("Replies, shares updates, listens") },
  { key: "tech", label: msg("Technical skills"), hint: msg("Quality of the work delivered") },
  { key: "reliability", label: msg("Reliability"), hint: msg("Does what they said, on time") },
  { key: "leadership", label: msg("Leadership"), hint: msg("Takes initiative, unblocks others") },
  { key: "teamwork", label: msg("Teamwork"), hint: msg("Helps the team succeed together") },
];
const words = ["", msg("Poor"), msg("Fair"), msg("Good"), msg("Very good"), msg("Excellent")];

/** Five-star input as a radio group: arrow keys change the value, like native radios. */
function StarRating({ value, onChange, label, size = "md" }: { value: number; onChange: (v: number) => void; label: string; size?: "md" | "lg" }) {
  const [hover, setHover] = React.useState(0);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;
  const pick = (v: number) => { onChange(v); refs.current[v - 1]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => { refs.current[n - 1] = el; }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5, ${t(words[n])}`}
          tabIndex={value === n || (!value && n === 1) ? 0 : -1}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); pick(Math.min(5, (value || 0) + 1)); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); pick(Math.max(1, (value || 1) - 1)); }
          }}
          className={cn("tap flex items-center justify-center rounded-lg transition-transform duration-150 hover:scale-110 active:scale-95", size === "lg" ? "size-11" : "size-9")}
        >
          <Star weight={n <= shown ? "fill" : "regular"} className={cn("transition-colors", size === "lg" ? "size-8" : "size-6", n <= shown ? "text-warm" : "text-input")} aria-hidden />
        </button>
      ))}
    </div>
  );
}

type Draft = { rating: number; cats: Record<string, number>; feedback: string };
const emptyDraft: Draft = { rating: 0, cats: {}, feedback: "" };

const Stars = ({ n, className }: { n: number; className?: string }) => (
  <span className={cn("inline-flex", className)} aria-label={`${n} of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} weight={i <= n ? "fill" : "regular"} className={i <= n ? "text-warm" : "text-input"} aria-hidden />)}
  </span>
);

/** What the student wrote about a teammate. Reviews can't be edited once sent. */
function SentReview({ review }: { review: MyReview }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Stars n={review.rating} className="[&_svg]:size-6" />
        <span className="text-sm font-semibold text-warm-text">{t(words[review.rating])}</span>
        <time dateTime={review.createdAt} className="ml-auto text-xs text-muted-foreground">{t("Sent")} {timeAgo(review.createdAt)}</time>
      </div>
      <dl className="divide-y rounded-2xl border">
        {categories.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-4 px-4 py-2">
            <dt className="text-sm font-semibold">{t(c.label)}</dt>
            <dd><Stars n={review.categoryRatings[c.key] ?? review.rating} className="[&_svg]:size-4" /></dd>
          </div>
        ))}
      </dl>
      {review.feedback && <blockquote className="whitespace-pre-line rounded-2xl bg-muted px-4 py-3 text-sm">{review.feedback}</blockquote>}
    </div>
  );
}

export function PeerReviewPanel() {
  const { t } = useT();
  const user = useUser();
  const { team, loaded } = useTeam();
  const submitPeerReview = useAppStore((s) => s.submitPeerReview);

  const mates = React.useMemo(() => team?.members.filter((m) => m.userId !== user.id) ?? [], [team, user.id]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reviews already sent for this team, from the database (one per teammate, enforced there too).
  const [sent, setSent] = React.useState<MyReview[] | null>(null);
  const teamId = team?.id;
  const loadSent = React.useCallback(() => {
    if (!teamId) return Promise.resolve();
    return getMyReviews(teamId).then(setSent).catch((err) => { console.error("Loading your reviews failed:", err); setSent((x) => x ?? []); });
  }, [teamId]);
  const live = useLive("peer_reviews");
  React.useEffect(() => { loadSent(); }, [loadSent, live]);
  const done = React.useMemo(() => sent?.map((r) => r.revieweeId) ?? [], [sent]);

  const mateId = selected && mates.some((m) => m.userId === selected) ? selected : mates.find((m) => !done.includes(m.userId))?.userId ?? mates[0]?.userId ?? null;
  const mate = mates.find((m) => m.userId === mateId);

  if (!loaded || (team && !sent)) return <Page><PanelSkeleton /></Page>;
  if (!team) return <Page><Card><NoTeam /></Card></Page>;

  const draft = (mateId && drafts[mateId]) || emptyDraft;
  const setDraft = (patch: Partial<Draft>) => { if (mateId) setDrafts((d) => ({ ...d, [mateId]: { ...(d[mateId] ?? emptyDraft), ...patch } })); setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mate || !team) return;
    if (!draft.rating) return setError(t("Choose an overall rating first."));
    setSubmitting(true);
    // Categories left blank take the overall rating.
    const cats = Object.fromEntries(categories.map((c) => [c.key, draft.cats[c.key] || draft.rating]));
    const ok = await submitPeerReview(team.id, mate.userId, draft.rating, draft.feedback.trim(), cats);
    setSubmitting(false);
    if (ok) await loadSent();
  }

  const reviewed = mates.filter((m) => done.includes(m.userId)).length;

  return (
    <Page>
      <PageHeader title={t("Peer review")} description={t("Rate how each teammate contributed. Honest feedback helps your instructor support the team.")} />

      {mates.length === 0 ? (
        <Card><EmptyState icon={UsersThree} title={t("No teammates to review yet")} description={t("Once more people join your team, you can review them here.")} /></Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold">{t("Your progress")}</p>
                <p className="text-sm font-bold tabular-nums text-primary">{t("{n} of {total}", { n: reviewed, total: mates.length })}</p>
              </div>
              <Progress className="mt-3" value={(reviewed / mates.length) * 100} label={t("Teammates reviewed")} />
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                <LockKey weight="fill" className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                {t("Private: only your instructor reads reviews. Teammates never see what you wrote.")}
              </p>
            </Card>

            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1 scroll-thin lg:flex-col lg:overflow-visible lg:pb-0" aria-label={t("Teammates")}>
              {mates.map((m) => {
                const isDone = done.includes(m.userId);
                const active = m.userId === mateId;
                return (
                  <li key={m.userId} className="shrink-0 lg:shrink">
                    <button type="button" onClick={() => { setSelected(m.userId); setError(null); }} aria-pressed={active}
                      className={cn("tap flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-soft",
                        active ? "border-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]" : "hover:border-primary/40")}>
                      <Avatar name={m.name} id={m.userId} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{m.name}</span>
                        <span className={cn("block text-xs", isDone ? "font-semibold text-success" : "text-muted-foreground")}>{isDone ? t("Reviewed") : t("Not reviewed yet")}</span>
                      </span>
                      {isDone && <CheckCircle weight="fill" className="size-5 shrink-0 text-success" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <AnimatePresence mode="wait">
            {mate && (
              <motion.div key={mate.userId + (done.includes(mate.userId) ? "-done" : "")} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: EASE }}>
                <Card className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-4 border-b bg-muted/40 p-5 sm:p-6">
                    <Avatar name={mate.name} id={mate.userId} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold">{mate.name}</h2>
                      {mate.bio && <p className="text-sm text-muted-foreground">{mate.bio}</p>}
                      {mate.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{mate.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>}
                    </div>
                  </div>

                  {done.includes(mate.userId) ? (
                    <div className="flex flex-col items-center px-6 py-14 text-center" role="status">
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
                        className="flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
                        <CheckCircle weight="fill" className="size-9" aria-hidden />
                      </motion.span>
                      <h3 className="mt-4 text-lg font-bold">{t("Review sent")}</h3>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("Your review of {name} is with your instructor. Here is what you wrote.", { name: mate.name })}</p>
                      {reviewed < mates.length && (
                        <Button className="mt-5" onClick={() => setSelected(mates.find((m) => !done.includes(m.userId))!.userId)}>{t("Review next teammate")}</Button>
                      )}
                      <div className="mt-8 w-full max-w-lg text-left">
                        <SentReview review={sent!.find((r) => r.revieweeId === mate.userId)!} />
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={submit} className="space-y-7 p-5 sm:p-6" noValidate>
                      <div>
                        <p className="text-sm font-bold">{t("Overall, how was working with")} {firstName(mate.name)}?</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <StarRating size="lg" value={draft.rating} onChange={(rating) => setDraft({ rating })} label={t("Overall rating for {name}", { name: mate.name })} />
                          <span className="text-sm font-semibold text-warm-text" aria-hidden>{t(words[draft.rating])}</span>
                        </div>
                        {error && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>}
                      </div>

                      <fieldset>
                        <legend className="text-sm font-bold">{t("By area")} <span className="font-normal text-muted-foreground">{t("(optional, defaults to the overall rating)")}</span></legend>
                        <div className="mt-3 divide-y rounded-2xl border">
                          {categories.map((c) => (
                            <div key={c.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                              <div><p className="text-sm font-semibold">{t(c.label)}</p><p className="text-xs text-muted-foreground">{t(c.hint)}</p></div>
                              <StarRating value={draft.cats[c.key] || draft.rating} onChange={(v) => setDraft({ cats: { ...draft.cats, [c.key]: v } })} label={t("{label} rating for {name}", { label: c.label, name: mate.name })} />
                            </div>
                          ))}
                        </div>
                      </fieldset>

                      <Field label={t("Written feedback")} htmlFor="review-feedback" optional hint={t("{count}/4000 · What went well? What could be better?", { count: draft.feedback.length })}>
                        <Textarea id="review-feedback" value={draft.feedback} maxLength={4000} onChange={(e) => setDraft({ feedback: e.target.value })} placeholder={t("Be specific and kind. Examples help.")} aria-describedby="review-feedback-hint" />
                      </Field>

                      <div className="flex justify-end">
                        <Button type="submit" size="lg" loading={submitting}><PaperPlaneTilt weight="fill" aria-hidden /> {t("Submit review")}</Button>
                      </div>
                    </form>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Page>
  );
}
