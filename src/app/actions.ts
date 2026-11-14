"use server";

// Every action runs as the signed-in user via withUser(), so Postgres RLS decides what each one may read or write.
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { withUser } from "@/db";
import * as s from "@/db/schema";
import { inngest } from "@/inngest/client";
import { matchTeams } from "@/lib/ai";
import type {
  ChatMessage, ConflictAlert, FileUpload, KanbanTask, Notification, Team, UserProfile, TaskSuggestion, MatchProposal,
} from "@/lib/store";

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
    const rows = await tx.select().from(s.teams).orderBy(asc(s.teams.name));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);

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

    return rows.map((t) => {
      const p = progress.find((x) => x.teamId === t.id);
      const done = p?.doneTasks ?? 0;
      return {
        id: t.id,
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
        senderName: s.users.name, fileName: s.files.name, fileBytes: s.files.sizeBytes, filePath: s.files.storagePath,
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
      .select({ t: s.tasks, assigneeName: s.users.name })
      .from(s.tasks)
      .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
      .where(eq(s.tasks.teamId, teamId))
      .orderBy(asc(s.tasks.position));
    return rows.map(({ t, assigneeName }) => ({
      id: t.id, title: t.title, description: t.description, status: toUiStatus(t.status), priority: t.priority,
      assigneeId: t.assigneeId, assigneeName: assigneeName ?? "Unassigned", dueDate: t.dueDate,
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

// ─── Notifications ─────────────────────────────────────────────────────

export async function getNotifications(): Promise<Notification[]> {
  return withUser(async (tx, uid) => {
    const rows = await tx.select().from(s.notifications).where(eq(s.notifications.userId, uid))
      .orderBy(desc(s.notifications.createdAt)).limit(50);
    return rows.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.body, read: !!n.readAt, createdAt: n.createdAt }));
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

// ─── AI team matching (instructors) ────────────────────────────────────

export async function runTeamMatching(teamSize = 3): Promise<{ courseId: string; courseTitle: string; proposals: MatchProposal[] } | null> {
  z.number().int().min(2).max(8).parse(teamSize);
  // Read the pool first, then call the model outside the transaction so no DB connection waits on the model.
  const pool = await withUser(async (tx, uid) => {
    const [course] = await tx.select().from(s.courses).where(eq(s.courses.instructorId, uid)).orderBy(desc(s.courses.createdAt)).limit(1);
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

  const names = new Map(pool.students.map((st) => [st.id, st.name]));
  const teams = pool.students.length >= 2 ? await matchTeams(pool.students, teamSize) : [];
  return {
    courseId: pool.course.id,
    courseTitle: `${pool.course.code} · ${pool.course.title}`,
    proposals: teams.map((t) => ({
      name: t.name, score: t.score, strengths: t.strengths,
      members: t.member_ids.map((mid) => ({ id: mid, name: names.get(mid)! })),
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
