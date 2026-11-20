import "server-only";
import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { messages, tasks, teamSummaries, teams, users } from "@/db/schema";
import { summarizeWeek, type ChatLine } from "@/lib/ai";

// Writes with the database owner role, like the Inngest jobs: callers must check access first
// (the cron covers every team; the refresh action checks that the user can see the team).

const DAY = 24 * 3600 * 1000;

/** Monday (UTC) of the current week, as YYYY-MM-DD: the key a recap is stored under. */
export function currentWeekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function recentChat(teamId: string, since?: Date, limit = 40): Promise<ChatLine[]> {
  const rows = await db
    .select({ id: messages.id, content: messages.content, at: messages.createdAt, sender: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.teamId, teamId), since ? gt(messages.createdAt, since.toISOString()) : undefined))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .filter((r) => r.content.trim())
    .map((r) => ({ id: r.id, content: r.content, at: r.at, sender: r.sender ?? "Unknown" }));
}

/** Writes this week's recap for one team. Returns false when the week was too quiet to summarise. */
export async function summarizeTeamWeek(teamId: string): Promise<boolean> {
  const since = new Date(Date.now() - 7 * DAY);
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId));
  if (!team) return false;

  const owner = sql<string>`coalesce(${users.name}, 'unassigned')`;
  const label = (r: { title: string; owner: string }) => `${r.title} (${r.owner})`;
  const [lines, done, created, overdue] = await Promise.all([
    recentChat(teamId, since, 200),
    db.select({ title: tasks.title, owner }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.teamId, teamId), eq(tasks.status, "done"), gt(tasks.updatedAt, since.toISOString()))),
    db.select({ title: tasks.title, owner }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.teamId, teamId), gt(tasks.createdAt, since.toISOString()))),
    db.select({ title: tasks.title, owner }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.teamId, teamId), ne(tasks.status, "done"), lt(tasks.dueDate, new Date().toISOString().slice(0, 10)))),
  ]);
  if (!lines.length && !done.length && !created.length) return false;

  const recap = await summarizeWeek(team.name, lines, { done: done.map(label), created: created.map(label), overdue: overdue.map(label) });
  if (!recap) return false;

  const row = { teamId, weekStart: currentWeekStart(), ...recap, generatedAt: new Date().toISOString() };
  await db.insert(teamSummaries).values(row)
    .onConflictDoUpdate({ target: [teamSummaries.teamId, teamSummaries.weekStart], set: { ...recap, generatedAt: row.generatedAt } });
  return true;
}
