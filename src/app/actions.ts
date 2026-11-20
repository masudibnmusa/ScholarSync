"use server";

// Every action runs as the signed-in user via withUser(), so Postgres RLS decides what each one may read or write.
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { withUser } from "@/db";
import * as s from "@/db/schema";
import { inngest } from "@/inngest/client";
import { matchTeams } from "@/lib/ai";
import { currentWeekStart, summarizeTeamWeek } from "@/lib/summaries";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  ChatMessage, ConflictAlert, Course, FileUpload, KanbanTask, Notification, Team, UserProfile, TaskComment, TaskSuggestion, MatchProposal, WeeklySummary,
} from "@/lib/types";

const Id = z.uuid();
const toUiStatus = (st: "todo" | "in_progress" | "done") => (st === "in_progress" ? "in-progress" : st);
const toDbStatus = (st: KanbanTask["status"]) => (st === "in-progress" ? "in_progress" : st);

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ─── Profile ───────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  return withUser(async (tx, uid) => {
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, uid));
    if (!u) throw new Error("Profile not found");
    return { id: u.id, name: u.name, email: u.email, role: u.role, bio: u.bio, skills: u.skills, availability: u.availability };
  });
}

const ProfileInput = z.object({
  bio: z.string().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  availability: z.string().max(200).optional(),
});

export async function updateProfile(input: z.infer<typeof ProfileInput>) {
  const data = ProfileInput.parse(input);
  await withUser((tx, uid) => tx.update(s.users).set(data).where(eq(s.users.id, uid)));
}

// ─── Teams ─────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  return withUser(async (tx) => {
    const rows = await tx.select({ t: s.teams, courseCode: s.courses.code }).from(s.teams)
      .innerJoin(s.courses, eq(s.courses.id, s.teams.courseId)).orderBy(asc(s.teams.name));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.t.id);

    const members = await tx
      .select({
        teamId: s.teamMembers.teamId, userId: s.users.id, name: s.users.name,
        bio: s.users.bio, skills: s.users.skills, availability: s.users.availability,
      })
      .from(s.teamMembers)
      .innerJoin(s.users, eq(s.users.id, s.teamMembers.userId))
      .where(inArray(s.teamMembers.teamId, ids));
    const progress = await tx.select().from(s.teamProgress).where(inArray(s.teamProgress.teamId, ids));
    const contrib = await tx.select().from(s.memberContribution).where(inArray(s.memberContribution.teamId, ids));
    const msgCounts = await tx
      .select({ teamId: s.messages.teamId, n: count() })
      .from(s.messages)
      .where(inArray(s.messages.teamId, ids))
      .groupBy(s.messages.teamId);

    return rows.map(({ t, courseCode }) => {
      const p = progress.find((x) => x.teamId === t.id);
      const done = p?.doneTasks ?? 0;
      return {
        id: t.id,
        courseId: t.courseId,
        courseCode,
        name: t.name,
        description: t.description,
        healthScore: t.healthScore ?? 100, // no AI assessment yet: nothing flagged
        progress: p?.progressPct ?? 0,
        members: members
          .filter((m) => m.teamId === t.id)
          .map((m) => {
            const c = contrib.find((x) => x.teamId === t.id && x.userId === m.userId);
            return {
              id: m.userId, userId: m.userId, name: m.name, bio: m.bio, skills: m.skills, availability: m.availability,
              contribution: done ? Math.round(((c?.tasksDone ?? 0) / done) * 100) : 0,
            };
          }),
        _count: { tasks: p?.totalTasks ?? 0, messages: msgCounts.find((x) => x.teamId === t.id)?.n ?? 0 },
      };
    });
  });
}

// ─── Chat ──────────────────────────────────────────────────────────────

export async function getMessages(teamId: string): Promise<Omit<ChatMessage, "isMe">[]> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({
        id: s.messages.id, senderId: s.messages.senderId, content: s.messages.content, timestamp: s.messages.createdAt,
        senderName: s.users.name, senderRole: s.users.role, fileName: s.files.name, fileBytes: s.files.sizeBytes, filePath: s.files.storagePath,
      })
      .from(s.messages)
      .leftJoin(s.users, eq(s.users.id, s.messages.senderId))
      .leftJoin(s.files, eq(s.files.id, s.messages.fileId))
      .where(eq(s.messages.teamId, teamId))
      .orderBy(desc(s.messages.createdAt))
      .limit(200);
    return rows.reverse().map((r) => ({
      id: r.id,
      senderId: r.senderId ?? "",
      senderName: r.senderName ?? "Former member",
      fromInstructor: r.senderRole === "instructor",
      content: r.content,
      timestamp: r.timestamp,
      fileName: r.fileName,
      fileSize: r.fileBytes == null ? null : fmtSize(r.fileBytes),
      filePath: r.filePath,
    }));
  });
}

const MessageInput = z.object({ teamId: Id, content: z.string().trim().max(4000), fileId: Id.optional() })
  .refine((m) => m.content || m.fileId, "Message is empty");

export async function sendMessage(teamId: string, content: string, fileId?: string) {
  const m = MessageInput.parse({ teamId, content, fileId });
  const [row] = await withUser((tx) =>
    tx.insert(s.messages).values({ teamId: m.teamId, content: m.content, fileId: m.fileId }).returning({ id: s.messages.id }),
  );
  try {
    await inngest.send({ name: "chat/message.created", data: { teamId: m.teamId, messageId: row.id } });
  } catch (err) {
    // The message is saved; only the AI task extraction is skipped.
    console.error("Inngest unavailable, task extraction skipped:", err);
  }
}

// ─── Tasks ─────────────────────────────────────────────────────────────

export async function getTasks(teamId: string): Promise<KanbanTask[]> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({
        t: s.tasks, assigneeName: s.users.name,
        commentCount: sql<number>`(select count(*) from public.task_comments c where c.task_id = ${s.tasks.id})::int`,
      })
      .from(s.tasks)
      .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
      .where(eq(s.tasks.teamId, teamId))
      .orderBy(asc(s.tasks.position));
    return rows.map(({ t, assigneeName, commentCount }) => ({
      id: t.id, title: t.title, description: t.description, status: toUiStatus(t.status), priority: t.priority,
      assigneeId: t.assigneeId, assigneeName: assigneeName ?? "Unassigned", dueDate: t.dueDate, commentCount,
    }));
  });
}

const emptyToNull = (v: unknown) => (v === "" ? null : v);
const TaskFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in-progress", "done"]),
  dueDate: z.preprocess(emptyToNull, z.iso.date().nullable()),
  assigneeId: z.preprocess(emptyToNull, Id.nullable()),
});

export async function createTask(teamId: string, input: { title: string; description: string; priority: string; dueDate: string; assigneeId: string }) {
  Id.parse(teamId);
  const t = TaskFields.omit({ status: true }).parse(input);
  await withUser((tx) => tx.insert(s.tasks).values({ ...t, teamId, position: Date.now() }));
}

export async function updateTask(taskId: string, patch: Partial<KanbanTask>) {
  Id.parse(taskId);
  const { status, ...rest } = TaskFields.partial().parse(patch);
  await withUser((tx) =>
    tx.update(s.tasks)
      .set({ ...rest, ...(status && { status: toDbStatus(status), position: Date.now() }) })
      .where(eq(s.tasks.id, taskId)),
  );
}

export async function deleteTask(taskId: string) {
  Id.parse(taskId);
  await withUser((tx) => tx.delete(s.tasks).where(eq(s.tasks.id, taskId)));
}

// ─── Task comments (RLS: team members and the course instructor) ───────

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  Id.parse(taskId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({ c: s.taskComments, authorName: s.users.name })
      .from(s.taskComments)
      .leftJoin(s.users, eq(s.users.id, s.taskComments.authorId))
      .where(eq(s.taskComments.taskId, taskId))
      .orderBy(asc(s.taskComments.createdAt));
    return rows.map(({ c, authorName }) => ({ id: c.id, authorId: c.authorId, authorName: authorName ?? "Former member", body: c.body, createdAt: c.createdAt }));
  });
}

const CommentBody = z.string().trim().min(1, "Write something first").max(2000);

export async function addTaskComment(taskId: string, body: string) {
  Id.parse(taskId);
  const text = CommentBody.parse(body);
  await withUser((tx) => tx.insert(s.taskComments).values({ taskId, body: text }));
}

export async function deleteTaskComment(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.delete(s.taskComments).where(eq(s.taskComments.id, id)));
}

// ─── Weekly AI recap ───────────────────────────────────────────────────

export async function getWeeklySummary(teamId: string): Promise<WeeklySummary | null> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const [r] = await tx.select().from(s.teamSummaries).where(eq(s.teamSummaries.teamId, teamId))
      .orderBy(desc(s.teamSummaries.weekStart)).limit(1);
    return r ? { weekStart: r.weekStart, summary: r.summary, done: r.done, late: r.late, decisions: r.decisions, generatedAt: r.generatedAt } : null;
  });
}

const RECAP_COOLDOWN_MS = 10 * 60 * 1000;

/** Regenerates this week's recap on demand. "cooldown" = one was made in the last 10 minutes; "quiet" = nothing to summarise. */
export async function refreshWeeklySummary(teamId: string): Promise<"ok" | "cooldown" | "quiet"> {
  Id.parse(teamId);
  // RLS decides whether this user may see the team; only then does the owner-role generator run.
  const recent = await withUser(async (tx) => {
    const [team] = await tx.select({ id: s.teams.id }).from(s.teams).where(eq(s.teams.id, teamId));
    if (!team) throw new Error("Team not found");
    const [r] = await tx.select({ at: s.teamSummaries.generatedAt }).from(s.teamSummaries)
      .where(and(eq(s.teamSummaries.teamId, teamId), eq(s.teamSummaries.weekStart, currentWeekStart())));
    return r?.at;
  });
  if (recent && Date.now() - new Date(recent).getTime() < RECAP_COOLDOWN_MS) return "cooldown";
  return (await summarizeTeamWeek(teamId)) ? "ok" : "quiet";
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function getNotifications(): Promise<Notification[]> {
  return withUser(async (tx, uid) => {
    const rows = await tx.select().from(s.notifications).where(eq(s.notifications.userId, uid))
      .orderBy(desc(s.notifications.createdAt)).limit(50);
    return rows.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.body, read: !!n.readAt, createdAt: n.createdAt, link: n.link }));
  });
}

export async function markNotificationRead(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.update(s.notifications).set({ readAt: new Date().toISOString() }).where(eq(s.notifications.id, id)));
}

export async function markAllNotificationsRead() {
  await withUser((tx, uid) =>
    tx.update(s.notifications).set({ readAt: new Date().toISOString() })
      .where(and(eq(s.notifications.userId, uid), isNull(s.notifications.readAt))),
  );
}

// ─── Files (bytes go browser → Storage directly; this records the row) ──

export async function getFiles(teamId: string): Promise<FileUpload[]> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({ f: s.files, uploader: s.users.name })
      .from(s.files)
      .leftJoin(s.users, eq(s.users.id, s.files.uploaderId))
      .where(eq(s.files.teamId, teamId))
      .orderBy(desc(s.files.createdAt));
    return rows.map(({ f, uploader }) => ({
      id: f.id, fileName: f.name, fileSize: f.sizeBytes, fileType: f.mimeType,
      uploadedBy: uploader ?? "Former member", createdAt: f.createdAt, storagePath: f.storagePath,
    }));
  });
}

const FileInput = z.object({
  teamId: Id,
  name: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(1024),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(255),
}).refine((f) => f.storagePath.startsWith(`${f.teamId}/`), "File path must be inside the team folder");

export async function recordFile(input: z.infer<typeof FileInput>) {
  const f = FileInput.parse(input);
  const [row] = await withUser((tx) =>
    tx.insert(s.files).values({
      teamId: f.teamId, name: f.name, storagePath: f.storagePath, sizeBytes: f.size, mimeType: f.mimeType || "application/octet-stream",
    }).returning({ id: s.files.id }),
  );
  return row.id;
}

// ─── Peer review ───────────────────────────────────────────────────────

const Rating = z.number().int().min(1).max(5);
const ReviewInput = z.object({
  teamId: Id, revieweeId: Id, rating: Rating, feedback: z.string().max(4000), categoryRatings: z.record(z.string().max(50), Rating),
});

export async function submitPeerReview(teamId: string, revieweeId: string, rating: number, feedback: string, categoryRatings: Record<string, number>) {
  const r = ReviewInput.parse({ teamId, revieweeId, rating, feedback, categoryRatings });
  await withUser((tx, uid) => tx.insert(s.peerReviews).values({ ...r, reviewerId: uid }));
}

// ─── Conflict alerts (instructors) ─────────────────────────────────────

export async function getConflicts(): Promise<ConflictAlert[]> {
  return withUser(async (tx) => {
    const rows = await tx
      .select({ a: s.conflictAlerts, teamName: s.teams.name })
      .from(s.conflictAlerts)
      .innerJoin(s.teams, eq(s.teams.id, s.conflictAlerts.teamId))
      .orderBy(desc(s.conflictAlerts.createdAt));
    return rows.map(({ a, teamName }) => ({
      id: a.id, teamId: a.teamId, teamName, severity: a.severity, description: a.summary,
      sentimentScore: a.sentiment, isResolved: !!a.resolvedAt, createdAt: a.createdAt,
    }));
  });
}

export async function resolveConflict(id: string) {
  Id.parse(id);
  await withUser((tx, uid) =>
    tx.update(s.conflictAlerts).set({ resolvedAt: new Date().toISOString(), resolvedBy: uid }).where(eq(s.conflictAlerts.id, id)),
  );
}

// ─── AI task suggestions ───────────────────────────────────────────────

export async function getSuggestions(teamId: string): Promise<TaskSuggestion[]> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({ sg: s.taskSuggestions, source: s.messages.content })
      .from(s.taskSuggestions)
      .leftJoin(s.messages, eq(s.messages.id, s.taskSuggestions.sourceMessageId))
      .where(and(eq(s.taskSuggestions.teamId, teamId), eq(s.taskSuggestions.status, "pending")))
      .orderBy(desc(s.taskSuggestions.createdAt));
    return rows.map(({ sg, source }) => ({ id: sg.id, title: sg.title, description: sg.description, source: source ?? "" }));
  });
}

export async function acceptSuggestion(id: string) {
  Id.parse(id);
  await withUser(async (tx) => {
    const [sg] = await tx.update(s.taskSuggestions).set({ status: "accepted" })
      .where(and(eq(s.taskSuggestions.id, id), eq(s.taskSuggestions.status, "pending"))).returning();
    if (!sg) throw new Error("Suggestion not found or already handled");
    await tx.insert(s.tasks).values({ teamId: sg.teamId, title: sg.title, description: sg.description, position: Date.now() });
  });
}

export async function dismissSuggestion(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.update(s.taskSuggestions).set({ status: "dismissed" }).where(eq(s.taskSuggestions.id, id)));
}

// ─── Courses ───────────────────────────────────────────────────────────

export async function getCourses(): Promise<Course[]> {
  return withUser(async (tx, uid) => {
    const rows = await tx
      .select({ c: s.courses, instructorName: s.users.name, studentCount: sql<number>`public.course_student_count(${s.courses.id})::int`, teamTotal: sql<number>`public.course_team_count(${s.courses.id})::int` })
      .from(s.courses)
      .leftJoin(s.users, eq(s.users.id, s.courses.instructorId))
      .orderBy(desc(s.courses.createdAt));
    if (!rows.length) return [];
    // RLS trims these to what the caller may see: the full roster and every team for their own courses, their own row and team otherwise.
    const enrolled = await tx
      .select({ courseId: s.courseEnrollments.courseId, userId: s.courseEnrollments.userId, name: s.users.name })
      .from(s.courseEnrollments)
      .innerJoin(s.users, eq(s.users.id, s.courseEnrollments.userId));
    const teams = await tx.select({ id: s.teams.id, courseId: s.teams.courseId, name: s.teams.name }).from(s.teams);
    const members = teams.length
      ? await tx.select().from(s.teamMembers).where(inArray(s.teamMembers.teamId, teams.map((t) => t.id)))
      : [];

    return rows.map(({ c, instructorName, studentCount, teamTotal }) => {
      const courseTeams = teams.filter((t) => t.courseId === c.id);
      const placed = new Set(members.filter((m) => courseTeams.some((t) => t.id === m.teamId)).map((m) => m.userId));
      const roster = enrolled.filter((e) => e.courseId === c.id);
      const isMine = c.instructorId === uid;
      const myTeamId = members.find((m) => m.userId === uid && courseTeams.some((t) => t.id === m.teamId))?.teamId;
      return {
        id: c.id, code: c.code, title: c.title, term: c.term, description: c.description, goals: c.goals, rationale: c.rationale,
        instructorName: instructorName ?? "Instructor",
        isMine,
        enrolled: roster.some((e) => e.userId === uid),
        studentCount,
        teamCount: teamTotal,
        unplaced: isMine ? roster.filter((e) => !placed.has(e.userId)).length : 0,
        myTeam: courseTeams.find((t) => t.id === myTeamId)?.name ?? null,
        students: isMine ? roster.map((e) => e.name) : [],
      };
    });
  });
}

const CourseInput = z.object({
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  title: z.string().trim().min(3).max(120),
  term: z.string().trim().min(3).max(40),
  description: z.string().trim().max(4000).optional(),
  goals: z.string().trim().max(4000).optional(),
  rationale: z.string().trim().max(4000).optional(),
});

export async function createCourse(input: z.input<typeof CourseInput>) {
  const c = CourseInput.parse(input);
  // RLS (courses_write) rejects non-instructors.
  await withUser((tx, uid) => tx.insert(s.courses).values({ ...c, instructorId: uid }));
}

export async function updateCourse(id: string, input: z.input<typeof CourseInput>) {
  Id.parse(id);
  const c = CourseInput.parse(input);
  const rows = await withUser((tx) => tx.update(s.courses).set(c).where(eq(s.courses.id, id)).returning({ id: s.courses.id }));
  if (!rows.length) throw new Error("Course not found or not yours");
}

/**
 * Removes the stored uploads of these teams. Runs BEFORE the rows are deleted: the storage policy checks
 * that the caller teaches the team, which can't be checked once the team is gone.
 */
async function removeTeamFiles(teamIds: string[]) {
  if (!teamIds.length) return;
  const paths = await withUser((tx) =>
    tx.select({ path: s.files.storagePath }).from(s.files).where(inArray(s.files.teamId, teamIds)));
  if (!paths.length) return;
  const sb = await supabaseServer();
  for (let i = 0; i < paths.length; i += 1000) { // Storage removes at most 1000 objects per call
    const { error } = await sb.storage.from("team-files").remove(paths.slice(i, i + 1000).map((p) => p.path));
    if (error) throw new Error(`Could not remove the team's files: ${error.message}`);
  }
}

export async function deleteCourse(id: string) {
  Id.parse(id);
  const teamIds = await withUser(async (tx, uid) => {
    const [c] = await tx.select({ id: s.courses.id }).from(s.courses).where(and(eq(s.courses.id, id), eq(s.courses.instructorId, uid)));
    if (!c) throw new Error("Course not found or not yours");
    return (await tx.select({ id: s.teams.id }).from(s.teams).where(eq(s.teams.courseId, id))).map((t) => t.id);
  });
  await removeTeamFiles(teamIds);
  await withUser((tx) => tx.delete(s.courses).where(eq(s.courses.id, id)));
}

export async function deleteTeam(id: string) {
  Id.parse(id);
  await withUser(async (tx, uid) => {
    const [t] = await tx.select({ id: s.teams.id }).from(s.teams)
      .innerJoin(s.courses, eq(s.courses.id, s.teams.courseId))
      .where(and(eq(s.teams.id, id), eq(s.courses.instructorId, uid)));
    if (!t) throw new Error("Team not found or not yours");
  });
  await removeTeamFiles([id]);
  // Cascades to members, tasks, chat, file rows, reviews, alerts and suggestions. Members return to "no team".
  await withUser((tx) => tx.delete(s.teams).where(eq(s.teams.id, id)));
}

export async function joinCourse(id: string) {
  Id.parse(id);
  await withUser((tx, uid) => tx.insert(s.courseEnrollments).values({ courseId: id, userId: uid }).onConflictDoNothing());
}

export async function leaveCourse(id: string) {
  Id.parse(id);
  // A trigger also takes the student off this course's teams.
  await withUser((tx, uid) => tx.delete(s.courseEnrollments).where(and(eq(s.courseEnrollments.courseId, id), eq(s.courseEnrollments.userId, uid))));
}

// ─── Team editing (instructors) ────────────────────────────────────────

export type RosterStudent = { id: string; name: string; skills: string[]; teamId: string | null; teamName: string | null };

/** Everyone enrolled in a course, with the team each one is on (if any). RLS limits this to the course's instructor. */
export async function getCourseRoster(courseId: string): Promise<RosterStudent[]> {
  Id.parse(courseId);
  return withUser(async (tx) => {
    const students = await tx
      .select({ id: s.users.id, name: s.users.name, skills: s.users.skills })
      .from(s.courseEnrollments)
      .innerJoin(s.users, eq(s.users.id, s.courseEnrollments.userId))
      .where(eq(s.courseEnrollments.courseId, courseId))
      .orderBy(asc(s.users.name));
    const placed = await tx
      .select({ userId: s.teamMembers.userId, teamId: s.teams.id, teamName: s.teams.name })
      .from(s.teamMembers)
      .innerJoin(s.teams, eq(s.teams.id, s.teamMembers.teamId))
      .where(eq(s.teams.courseId, courseId));
    return students.map((st) => {
      const p = placed.find((x) => x.userId === st.id);
      return { ...st, teamId: p?.teamId ?? null, teamName: p?.teamName ?? null };
    });
  });
}

const TeamEdit = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  memberIds: z.array(Id).min(1).max(20),
});

/** Renames a team and sets its exact member list. A student moved in from another team of the same course leaves that team. */
export async function updateTeam(teamId: string, input: z.infer<typeof TeamEdit>) {
  Id.parse(teamId);
  const t = TeamEdit.parse(input);
  const ids = [...new Set(t.memberIds)];
  await withUser(async (tx) => {
    // RLS (teams_write) makes this return nothing unless the caller teaches the team's course.
    const [team] = await tx.update(s.teams).set({ name: t.name, description: t.description })
      .where(eq(s.teams.id, teamId)).returning({ courseId: s.teams.courseId });
    if (!team) throw new Error("Team not found or not yours");

    const enrolled = await tx.select({ id: s.courseEnrollments.userId }).from(s.courseEnrollments)
      .where(and(eq(s.courseEnrollments.courseId, team.courseId), inArray(s.courseEnrollments.userId, ids)));
    if (enrolled.length !== ids.length) throw new Error("Every member must be enrolled in the course");

    const courseTeams = tx.select({ id: s.teams.id }).from(s.teams).where(eq(s.teams.courseId, team.courseId));
    // Off this team: anyone not in the new list. Off other teams in this course: anyone joining this one.
    await tx.delete(s.teamMembers).where(and(eq(s.teamMembers.teamId, teamId), notInArray(s.teamMembers.userId, ids)));
    await tx.delete(s.teamMembers).where(and(inArray(s.teamMembers.teamId, courseTeams), inArray(s.teamMembers.userId, ids), sql`${s.teamMembers.teamId} <> ${teamId}`));
    await tx.insert(s.teamMembers).values(ids.map((userId) => ({ teamId, userId }))).onConflictDoNothing();
  });
}

// ─── AI team matching (instructors) ────────────────────────────────────

export async function runTeamMatching(teamSize = 3, courseId?: string): Promise<{ courseId: string; courseTitle: string; proposals: MatchProposal[] } | null> {
  z.number().int().min(2).max(8).parse(teamSize);
  Id.optional().parse(courseId);
  // Read the pool first, then call the model outside the transaction so no DB connection waits on the model.
  const pool = await withUser(async (tx, uid) => {
    const [course] = await tx.select().from(s.courses)
      .where(and(eq(s.courses.instructorId, uid), courseId ? eq(s.courses.id, courseId) : undefined))
      .orderBy(desc(s.courses.createdAt)).limit(1);
    if (!course) return null;
    const placed = tx.select({ id: s.teamMembers.userId }).from(s.teamMembers)
      .innerJoin(s.teams, eq(s.teams.id, s.teamMembers.teamId)).where(eq(s.teams.courseId, course.id));
    const students = await tx
      .select({ id: s.users.id, name: s.users.name, skills: s.users.skills, availability: s.users.availability })
      .from(s.courseEnrollments)
      .innerJoin(s.users, eq(s.users.id, s.courseEnrollments.userId))
      .where(and(eq(s.courseEnrollments.courseId, course.id), notInArray(s.users.id, placed)));
    return { course, students };
  });
  if (!pool) return null;

  const byId = new Map(pool.students.map((st) => [st.id, st]));
  const teams = pool.students.length >= 2 ? await matchTeams(pool.students, teamSize) : [];
  return {
    courseId: pool.course.id,
    courseTitle: `${pool.course.code} · ${pool.course.title}`,
    proposals: teams.map((t) => ({
      name: t.name, score: t.score, strengths: t.strengths,
      members: t.member_ids.map((mid) => {
        const st = byId.get(mid)!;
        return { id: mid, name: st.name, skills: st.skills ?? [], availability: st.availability ?? "" };
      }),
    })),
  };
}

const ApplyInput = z.object({
  courseId: Id,
  teams: z.array(z.object({ name: z.string().trim().min(1).max(100), memberIds: z.array(Id).min(1) })).min(1),
});

export async function applyTeamMatching(courseId: string, teams: { name: string; memberIds: string[] }[]) {
  const input = ApplyInput.parse({ courseId, teams });
  const ids = [...new Set(input.teams.flatMap((t) => t.memberIds))];
  await withUser(async (tx) => {
    const enrolled = await tx.select({ id: s.courseEnrollments.userId }).from(s.courseEnrollments)
      .where(and(eq(s.courseEnrollments.courseId, input.courseId), inArray(s.courseEnrollments.userId, ids)));
    if (enrolled.length !== ids.length) throw new Error("Every member must be enrolled in the course");
    for (const t of input.teams) {
      const [team] = await tx.insert(s.teams).values({ courseId: input.courseId, name: t.name }).returning({ id: s.teams.id });
      await tx.insert(s.teamMembers).values(t.memberIds.map((userId) => ({ teamId: team.id, userId })));
    }
  });
}
