"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowClockwise, ArrowSquareOut, GitCommit, GitMerge, GitPullRequest, GithubLogo, LinkBreak, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { getRepoFeed, setTeamRepo, syncRepoNow } from "@/app/actions";
import { useLive } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { RepoFeed, Team } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { t, num } from "@/lib/i18n";

type Item = RepoFeed["activity"][number];

function ActivityIcon({ item }: { item: Item }) {
  const I = item.kind === "commit" ? GitCommit : item.state === "merged" ? GitMerge : GitPullRequest;
  const tone = item.kind === "commit" ? "bg-muted text-muted-foreground" : item.state === "merged" ? "bg-peach text-primary" : item.state === "open" ? "bg-sage text-success" : "bg-muted text-muted-foreground";
  return <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}><I weight="bold" className="size-4" aria-hidden /></span>;
}

function LinkForm({ team, onLinked }: { team: Team; onLinked: () => void }) {
  const { t } = useT();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const problem = await setTeamRepo(team.id, value);
      if (problem) setError(t(problem));
      else {
        toast.success(t("Repository linked"), { description: t("Commits and pull requests appear in a minute.") });
        onLinked();
      }
    } catch (err) {
      console.error("Linking the repo failed:", err);
      setError(t("Could not link the repository."));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={link} className="space-y-3 rounded-2xl border border-dashed p-4" aria-label={t("Link a repository")}>
      <Field label={t("GitHub repository")} htmlFor="repo-input" error={error} hint={t("owner/name, or paste the repository's link. Public repositories work right away.")}>
        <Input id="repo-input" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} placeholder={t("e.g. octocat/Hello-World")} autoComplete="off" spellCheck={false}
          aria-invalid={!!error || undefined} aria-describedby={error ? "repo-input-error" : "repo-input-hint"} />
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!value.trim()}>{!busy && <GithubLogo aria-hidden />} {t("Link repository")}</Button></div>
    </form>
  );
}

/**
 * The team's GitHub repository: link one, see who committed what and the latest pull requests. Commits count for a
 * member once their GitHub username is in their profile.
 */
export function RepoButton({ team }: { team: Team }) {
  const { t } = useT();
  const user = useUser();
  const [open, setOpen] = React.useState(false);
  const [feed, setFeed] = React.useState<RepoFeed | undefined>(undefined);
  const [syncing, setSyncing] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const live = useLive("repo_activity", "teams", "users");
  const editable = !team.courseArchived;

  const load = React.useCallback(() => getRepoFeed(team.id).then(setFeed).catch((err) => console.error("Loading the repo failed:", err)), [team.id]);
  React.useEffect(() => { if (open) load(); }, [open, load, live]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await syncRepoNow(team.id);
      if (r === "cooldown") toast.info(t("Checked less than a minute ago."));
      await load();
    } catch (err) {
      console.error("Syncing the repo failed:", err);
      toast.error(t("Could not reach GitHub"));
    }
    setSyncing(false);
  }

  async function unlink() {
    try {
      await setTeamRepo(team.id, null);
      toast.success(t("Repository unlinked"));
      await load();
    } catch (err) {
      console.error("Unlinking the repo failed:", err);
      toast.error(t("Could not unlink the repository"));
    }
  }

  const me = feed?.members.find((m) => m.userId === user.id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={t("GitHub repository")}><GithubLogo weight="duotone" aria-hidden /><span className="hidden xl:inline">{t("Repo")}</span></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-foreground text-background"><GithubLogo weight="fill" className="size-4" aria-hidden /></span>
            {team.name}{t("'s repository")}
          </DialogTitle>
          <DialogDescription>{t("Commits and pull requests from GitHub, checked every 30 minutes.")}</DialogDescription>
        </DialogHeader>

        {feed === undefined ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-32" /></div>
        ) : !feed.repo ? (
          editable ? <LinkForm team={team} onLinked={load} /> : <p className="text-sm text-muted-foreground">{t("No repository was linked.")}</p>
        ) : (
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3">
              <a href={`https://github.com/${feed.repo}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm font-bold hover:text-primary hover:underline">
                <span className="truncate">{feed.repo}</span><ArrowSquareOut className="size-3.5 shrink-0" aria-hidden /><span className="sr-only">{t("(opens GitHub)")}</span>
              </a>
              <span className="text-xs text-muted-foreground">{feed.syncedAt ? t("Checked {when}", { when: timeAgo(feed.syncedAt) }) : t("Not checked yet")}</span>
              {editable && (
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" loading={syncing} onClick={sync}>{!syncing && <ArrowClockwise aria-hidden />} {t("Check now")}</Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setUnlinking(true)}><LinkBreak aria-hidden /> {t("Unlink")}</Button>
                </span>
              )}
            </div>
            {feed.error && <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-warning"><WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />{t(feed.error)}</p>}

            <section aria-labelledby="repo-members">
              <h3 id="repo-members" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("Commits by member")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {feed.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2">
                    <Avatar id={m.userId} name={m.name} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.githubLogin ? `@${m.githubLogin}` : t("No GitHub username")}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums">{num(m.commits)}</span>
                  </li>
                ))}
              </ul>
              {me && !me.githubLogin && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Your commits don't count yet.")} <Link href="/student/profile#github" className="font-semibold text-primary hover:underline">{t("Add your GitHub username")}</Link>.
                </p>
              )}
            </section>

            <section aria-labelledby="repo-activity">
              <h3 id="repo-activity" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("Latest activity")}</h3>
              {feed.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{feed.syncedAt ? t("No commits or pull requests yet.") : t("Reading the repository…")}</p>
              ) : (
                <ul className="space-y-1">
                  {feed.activity.map((a) => (
                    <li key={a.id}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent">
                        <ActivityIcon item={a} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{a.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.kind === "commit" ? `${a.id.slice(0, 7)} · ` : ""}{a.author} · {timeAgo(a.at)}
                          </span>
                        </span>
                        {a.kind === "pr" && <Badge variant={a.state === "merged" ? "default" : a.state === "open" ? "success" : "muted"} className="capitalize">{a.state}</Badge>}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        <ConfirmDialog open={unlinking} onOpenChange={setUnlinking} title={t("Unlink {repo}?", { repo: feed?.repo ?? t("the repository") })} confirmLabel={t("Unlink")}
          description={t("Its commits and pull requests are removed from ScholarSync. Nothing changes on GitHub, and you can link it again.")} onConfirm={unlink} />
      </DialogContent>
    </Dialog>
  );
}
