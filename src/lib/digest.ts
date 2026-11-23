import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { notifications, users } from "@/db/schema";
import { notificationHref } from "@/components/app/nav";
import { buildDigest, buildInstructorDigest, weeklyCount, type WeeklyData } from "@/lib/digest-format";
import { sendEmail } from "@/lib/email";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MAX_ITEMS = 20;

/**
 * Emails one user their unread notifications from the last 24 hours that were not emailed yet.
 * The daily job marks them emailed; a sample (from the profile page) leaves them as they are.
 */
export async function sendDigestTo(userId: string, { sample = false } = {}): Promise<number> {
  const [u] = await db.select({ name: users.name, email: users.email, role: users.role, on: users.emailDigest, locale: users.locale }).from(users).where(eq(users.id, userId));
  if (!u || (!sample && !u.on)) return 0;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.emailedAt), gt(notifications.createdAt, since)))
    .orderBy(notifications.createdAt).limit(MAX_ITEMS);
  if (!rows.length) return 0;

  const base = appUrl();
  const items = rows.map((n) => ({ title: n.title, body: n.body, href: base + notificationHref(n.type, u.role, n.link) }));
  const sent = await sendEmail({ to: u.email, ...buildDigest(u.name, items, `${base}/${u.role}/profile`, u.locale) });
  if (!sent) return 0;
  if (!sample) await db.update(notifications).set({ emailedAt: new Date().toISOString() }).where(inArray(notifications.id, rows.map((n) => n.id)));
  return rows.length;
}

/** Everyone with the digest on and something new to read. */
export async function digestRecipients(): Promise<string[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await db.selectDistinct({ id: users.id }).from(users)
    .innerJoin(notifications, eq(notifications.userId, users.id))
    .where(and(eq(users.emailDigest, true), isNull(notifications.readAt), isNull(notifications.emailedAt), gt(notifications.createdAt, since)));
  return rows.map((r) => r.id);
}

// ─── Weekly instructor digest (Mondays) ─────────────────────────────────

/**
 * What needs the instructor in their live (not archived) courses: open falling-behind cases, unresolved conflict alerts,
 * pending requests for more time, and hand-ins missed in the last 14 days (by each team's own due date).
 * Runs as the service role, so every query is scoped to courses this instructor owns.
 */
export async function instructorWeek(userId: string): Promise<WeeklyData> {
  const base = appUrl();
  const rows = <T,>(q: ReturnType<typeof sql>) => db.execute(q) as unknown as Promise<T[]>;
  const [risk, conflicts, extensions, missing] = await Promise.all([
    rows<{ student: string; team: string; course: string; reasons: string[] }>(sql`
      select u.name as student, t.name as team, c.code as course, f.reasons
      from public.falling_behind f join public.teams t on t.id = f.team_id join public.courses c on c.id = t.course_id
      join public.users u on u.id = f.user_id
      where c.instructor_id = ${userId} and c.archived_at is null and f.resolved_at is null order by f.flagged_at`),
    rows<{ team: string; course: string; summary: string }>(sql`
      select t.name as team, c.code as course, a.summary
      from public.conflict_alerts a join public.teams t on t.id = a.team_id join public.courses c on c.id = t.course_id
      where c.instructor_id = ${userId} and c.archived_at is null and a.resolved_at is null order by a.created_at`),
    rows<{ team: string; course: string; course_id: string; milestone: string; until: string }>(sql`
      select t.name as team, c.code as course, c.id as course_id, m.title as milestone, x.new_date::text as until
      from public.deadline_extensions x join public.teams t on t.id = x.team_id join public.courses c on c.id = t.course_id
      join public.course_milestones m on m.id = x.milestone_id
      where c.instructor_id = ${userId} and c.archived_at is null and x.status = 'pending' order by x.requested_at`),
    rows<{ team: string; course: string; course_id: string; milestone: string; due: string }>(sql`
      select t.name as team, c.code as course, c.id as course_id, m.title as milestone, coalesce(x.approved_date, m.due_date)::text as due
      from public.course_milestones m join public.courses c on c.id = m.course_id join public.teams t on t.course_id = c.id
      left join public.deadline_extensions x on x.team_id = t.id and x.milestone_id = m.id
      where c.instructor_id = ${userId} and c.archived_at is null and m.requires_submission
        and coalesce(x.approved_date, m.due_date) between current_date - 14 and current_date - 1
        and not exists (select 1 from public.submissions s where s.team_id = t.id and s.milestone_id = m.id)
      order by due, t.name`),
  ]);
  return {
    risk: risk.map((r) => ({ ...r, href: `${base}/instructor/at-risk` })),
    conflicts: conflicts.map((r) => ({ ...r, href: `${base}/instructor/conflicts` })),
    extensions: extensions.map((r) => ({ team: r.team, course: r.course, milestone: r.milestone, until: r.until, href: `${base}/instructor/courses/${r.course_id}` })),
    missing: missing.map((r) => ({ team: r.team, course: r.course, milestone: r.milestone, due: r.due, href: `${base}/instructor/courses/${r.course_id}` })),
  };
}

/** Emails an instructor their week. Skipped when the email is off (unless it's a sample) or nothing needs them. */
export async function sendInstructorDigestTo(userId: string, { sample = false } = {}): Promise<number> {
  const [u] = await db.select({ name: users.name, email: users.email, role: users.role, on: users.emailDigest, locale: users.locale }).from(users).where(eq(users.id, userId));
  if (!u || u.role !== "instructor" || (!sample && !u.on)) return 0;
  const week = await instructorWeek(userId);
  const n = weeklyCount(week);
  if (!n) return 0;
  const sent = await sendEmail({ to: u.email, ...buildInstructorDigest(u.name, week, `${appUrl()}/instructor/profile`, u.locale) });
  return sent ? n : 0;
}

/** Instructors with the email on and at least one live course. */
export async function instructorDigestRecipients(): Promise<string[]> {
  const rows = await db.execute(sql`
    select distinct u.id from public.users u join public.courses c on c.instructor_id = u.id
    where u.role = 'instructor' and u.email_digest and c.archived_at is null`) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
