import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { courses, repoActivity, teams } from "@/db/schema";
export { parseRepo } from "@/lib/repo-name";

// Reads commits and pull requests from the GitHub REST API (polling; no webhook or GitHub App needed). Public repos
// work without a token at 60 requests an hour per server; set GITHUB_TOKEN for private repos and 5,000 an hour.
// GITHUB_API_URL points it elsewhere (GitHub Enterprise, or a stand-in when testing).

const API = () => process.env.GITHUB_API_URL ?? "https://api.github.com";

export class RepoError extends Error {}

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ScholarSync" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${API()}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new RepoError("Repository not found. Check the name; private repos need the server's GitHub token.");
  if (res.status === 403 || res.status === 429) throw new RepoError("GitHub's rate limit was reached. It will try again later.");
  if (res.status === 409) return [] as T; // an empty repository has no commits yet
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** The repo's name as GitHub spells it; throws RepoError when it can't be read. */
export async function checkRepo(repo: string): Promise<string> {
  const r = await gh<{ full_name: string }>(`/repos/${repo}`);
  return r.full_name;
}

type GhCommit = { sha: string; html_url: string; parents: unknown[]; author: { login: string } | null; commit: { message: string; author: { name: string; date: string } } };
type GhPull = { number: number; title: string; html_url: string; state: "open" | "closed"; merged_at: string | null; closed_at: string | null; created_at: string; user: { login: string } | null };

const FIRST_SYNC_DAYS = 120;

/**
 * Copies new commits (since the last sync, with a day of overlap; merge commits skipped) and the 50 most recently
 * updated pull requests into repo_activity. Records the time, or the error for the team to see.
 */
export async function syncTeamRepo(teamId: string): Promise<{ commits: number; prs: number } | null> {
  const [team] = await db.select({ repo: teams.repo, syncedAt: teams.repoSyncedAt }).from(teams).where(eq(teams.id, teamId));
  if (!team?.repo) return null;
  const since = new Date(team.syncedAt ? new Date(team.syncedAt).getTime() - 86_400_000 : Date.now() - FIRST_SYNC_DAYS * 86_400_000).toISOString();
  try {
    const commits: GhCommit[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await gh<GhCommit[]>(`/repos/${team.repo}/commits?since=${since}&per_page=100&page=${page}`);
      commits.push(...batch);
      if (batch.length < 100) break;
    }
    const pulls = await gh<GhPull[]>(`/repos/${team.repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`);

    const rows = [
      ...commits.filter((c) => c.parents.length < 2).map((c) => ({
        teamId, id: c.sha, kind: "commit" as const, githubLogin: c.author?.login ?? null, authorName: c.commit.author.name,
        title: c.commit.message.split("\n")[0].slice(0, 300), url: c.html_url, state: null, at: c.commit.author.date,
      })),
      ...pulls.map((p) => ({
        teamId, id: `pr-${p.number}`, kind: "pr" as const, githubLogin: p.user?.login ?? null, authorName: p.user?.login ?? "",
        title: p.title.slice(0, 300), url: p.html_url, state: p.merged_at ? "merged" as const : p.state,
        at: p.merged_at ?? p.closed_at ?? p.created_at,
      })),
    ].filter((r) => r.url.startsWith("https://github.com/")); // the table only takes github.com links
    if (rows.length) {
      await db.insert(repoActivity).values(rows).onConflictDoUpdate({
        target: [repoActivity.teamId, repoActivity.id],
        set: { title: sql`excluded.title`, state: sql`excluded.state`, at: sql`excluded.at`, githubLogin: sql`excluded.github_login` },
      });
    }
    // Only if the repo is still the one we read (it may have been changed meanwhile).
    await db.update(teams).set({ repoSyncedAt: new Date().toISOString(), repoError: null }).where(and(eq(teams.id, teamId), eq(teams.repo, team.repo)));
    return { commits: rows.filter((r) => r.kind === "commit").length, prs: pulls.length };
  } catch (err) {
    const message = err instanceof RepoError ? err.message : "GitHub couldn't be reached. It will try again later.";
    await db.update(teams).set({ repoError: message }).where(and(eq(teams.id, teamId), eq(teams.repo, team.repo)));
    if (!(err instanceof RepoError)) throw err;
    return null;
  }
}

/** Teams with a linked repo in active courses, for the periodic sync. */
export function linkedTeams() {
  return db.select({ id: teams.id }).from(teams).innerJoin(courses, eq(courses.id, teams.courseId))
    .where(and(isNotNull(teams.repo), isNull(courses.archivedAt)));
}
