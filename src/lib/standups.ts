import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { courses, notifications, standups, standupSummaries, teamMembers, teams, teamSummaries, users } from "@/db/schema";
import { summarizeStandup } from "@/lib/ai";
import { currentWeekStart } from "@/lib/summaries";

// Writes with the database owner role, like the recaps: callers check access first.

/**
 * Writes (or rewrites) this week's stand-up summary for one team and tells the instructor the first time, or when
 * more blockers come up. Returns false when nobody has answered yet.
 */
export async function summarizeTeamStandup(teamId: string): Promise<boolean> {
  const week = currentWeekStart();
  const [team] = await db.select({ name: teams.name, courseId: teams.courseId, instructorId: courses.instructorId })
    .from(teams).innerJoin(courses, eq(courses.id, teams.courseId)).where(eq(teams.id, teamId));
  if (!team) return false;

  const [members, answers, [recap], [before]] = await Promise.all([
    db.select({ userId: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, teamId)),
    db.select({ userId: standups.userId, done: standups.done, next: standups.next, blocked: standups.blocked })
      .from(standups).where(and(eq(standups.teamId, teamId), eq(standups.weekStart, week))),
    db.select({ summary: teamSummaries.summary, late: teamSummaries.late }).from(teamSummaries)
      .where(and(eq(teamSummaries.teamId, teamId), eq(teamSummaries.weekStart, week))),
    db.select({ blockers: standupSummaries.blockers }).from(standupSummaries)
      .where(and(eq(standupSummaries.teamId, teamId), eq(standupSummaries.weekStart, week))),
  ]);
  const name = new Map(members.map((m) => [m.userId, m.name]));
  const mine = answers.filter((a) => name.has(a.userId)); // someone who left the team no longer counts
  if (!mine.length) return false;

  const out = await summarizeStandup(
    team.name,
    mine.map((a) => ({ name: name.get(a.userId)!, done: a.done, next: a.next, blocked: a.blocked })),
    members.filter((m) => !mine.some((a) => a.userId === m.userId)).map((m) => m.name),
    recap,
  );
  if (!out) throw new Error("The AI returned no stand-up summary"); // the job retries; the button shows an error

  const row = { ...out, answered: mine.length, generatedAt: new Date().toISOString() };
  await db.insert(standupSummaries).values({ teamId, weekStart: week, ...row })
    .onConflictDoUpdate({ target: [standupSummaries.teamId, standupSummaries.weekStart], set: row });

  if (!before || out.blockers.length > before.blockers.length) {
    await db.insert(notifications).values({
      userId: team.instructorId, type: "system",
      title: out.blockers.length ? `${team.name} stand-up: ${out.blockers.length} blocked` : `${team.name} stand-up summary`,
      body: out.blockers[0] ?? out.summary.slice(0, 200),
      link: `/instructor?team=${teamId}&standup=1`,
    });
  }
  return true;
}

/** Students in teams of active courses, to ask for this week's stand-up. */
export function standupAskees() {
  return db.select({ teamId: teams.id, teamName: teams.name, userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .innerJoin(courses, eq(courses.id, teams.courseId))
    .where(isNull(courses.archivedAt));
}
