"use server";

// Every action runs as the signed-in user via withUser(), so Postgres RLS decides what each one may read or write.
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { adminDb, AuthError, withUser } from "@/db";
import { LOCALE_COOKIE, LOCALE_PENDING_COOKIE, LOCALES, translate } from "@/lib/i18n";
import { translateNotice } from "@/lib/i18n/notices";
import { requestLocale } from "@/lib/locale-server";
import * as s from "@/db/schema";
import { inngest } from "@/inngest/client";
import { answerFromSources, extractActionItems, matchTeams, suggestMeetings, summarizeRetros } from "@/lib/ai";
import { cleanActionItems, MAX_ACTION_ITEMS, type ActionItem } from "@/lib/action-items";
import type { MeetingSlot } from "@/lib/meeting";
import { citeAnswer, type CitedSource, type StudySource } from "@/lib/study-buddy";
import { similarPairs, type SimilarPair } from "@/lib/similarity";
import { currentWeekStart, summarizeTeamWeek } from "@/lib/summaries";
import { summarizeTeamStandup } from "@/lib/standups";
import { checkRepo, parseRepo, RepoError, syncTeamRepo } from "@/lib/github";
import { toCsv } from "@/lib/utils";
import { sendDigestTo, sendInstructorDigestTo } from "@/lib/digest";
import { finalPercent, reviewFlags, suggestedFactor, teamPercent } from "@/lib/grading";
import { alias } from "drizzle-orm/pg-core";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  ChatMessage, ChatSearchHit, SearchHit, HelpQuestion, ConflictAlert, Course, FileUpload, KanbanTask, ChecklistItem, Notification, Team, UserProfile, TaskComment, TaskSuggestion, MatchProposal, Milestone, MyReview, WeeklySummary, TeamStandup, CourseInvite, WeekItem, CourseGrading, MyGrade, CriterionScore, TeamReview, Announcement, TaskEvent, AtRiskStudent, Contribution, RepoFeed, TeamCharter, CharterText, OfficeHourSlot, CourseTrends, RubricCheck, TeamRetro, RetroThemes, CourseTA,
} from "@/lib/types";
import { REACTIONS } from "@/lib/types";

const Id = z.uuid();
// Aliases for a reply's quoted parent message.
const parent = alias(s.messages, "parent");
const parentUser = alias(s.users, "parent_user");
const parentFile = alias(s.files, "parent_file");
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
    return { id: u.id, name: u.name, email: u.email, role: u.role, bio: u.bio, skills: u.skills, availability: u.availability, emailDigest: u.emailDigest, avatarPath: u.avatarPath, githubLogin: u.githubLogin, locale: u.locale };
  });
}

const ProfileInput = z.object({
  bio: z.string().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  availability: z.string().max(200).optional(),
  emailDigest: z.boolean().optional(),
  // Empty clears it. Same rule as GitHub's (and the table's check).
  githubLogin: z.string().trim().transform((v) => v.replace(/^@/, "") || null)
    .pipe(z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, "Not a GitHub username").nullable()).optional(),
});

export async function updateProfile(input: z.infer<typeof ProfileInput>) {
  const data = ProfileInput.parse(input);
  await withUser((tx, uid) => tx.update(s.users).set(data).where(eq(s.users.id, uid)));
}

/** Sets the interface language: the cookie for this browser, and my profile (for emails) when signed in. */
export async function setLanguage(locale: string) {
  const l = z.enum(LOCALES).parse(locale);
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  try {
    await withUser((tx, uid) => tx.update(s.users).set({ locale: l }).where(eq(s.users.id, uid)));
    jar.delete(LOCALE_PENDING_COOKIE);
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    // Signed out (sign-in page): the account gets this choice at the next sign-in.
    jar.set(LOCALE_PENDING_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax" });
  }
}

/** Profile photos of everyone I can see (RLS decides who), as user id → path in the avatars bucket. */
export async function getAvatars(): Promise<Record<string, string>> {
  return withUser(async (tx) => {
    const rows = await tx.select({ id: s.users.id, path: s.users.avatarPath }).from(s.users).where(isNotNull(s.users.avatarPath));
    return Object.fromEntries(rows.map((r) => [r.id, r.path as string]));
  });
}

/**
 * Everything the app stores about me, ready to save as JSON (Profile → Download my data). Read as me, so it is exactly
 * what RLS lets me see: peer reviews written about me stay out, as they do in the app (they're for the instructor).
 */
export async function exportMyData() {
  return withUser(async (tx, uid) => {
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, uid));
    if (!u) throw new Error("Profile not found");
    const teamName = s.teams.name;
    const [courses, taught, teams, tasks, messages, comments, files, standups, reviews, notifications, officeHours, extensions, agreements] = await Promise.all([
      tx.select({ code: s.courses.code, title: s.courses.title, term: s.courses.term, enrolledAt: s.courseEnrollments.enrolledAt })
        .from(s.courseEnrollments).innerJoin(s.courses, eq(s.courses.id, s.courseEnrollments.courseId)).where(eq(s.courseEnrollments.userId, uid)),
      tx.select({ code: s.courses.code, title: s.courses.title, term: s.courses.term }).from(s.courses).where(eq(s.courses.instructorId, uid)),
      tx.select({ team: teamName, course: s.courses.code, joinedAt: s.teamMembers.joinedAt }).from(s.teamMembers)
        .innerJoin(s.teams, eq(s.teams.id, s.teamMembers.teamId)).innerJoin(s.courses, eq(s.courses.id, s.teams.courseId)).where(eq(s.teamMembers.userId, uid)),
      tx.select({ team: teamName, title: s.tasks.title, description: s.tasks.description, status: s.tasks.status, priority: s.tasks.priority, dueDate: s.tasks.dueDate,
        assignedToMe: sql<boolean>`${s.tasks.assigneeId} is not distinct from ${uid}`, createdByMe: sql<boolean>`${s.tasks.createdBy} is not distinct from ${uid}`, createdAt: s.tasks.createdAt })
        .from(s.tasks).innerJoin(s.teams, eq(s.teams.id, s.tasks.teamId)).where(or(eq(s.tasks.assigneeId, uid), eq(s.tasks.createdBy, uid))).orderBy(asc(s.tasks.createdAt)),
      tx.select({ team: teamName, content: s.messages.content, sentAt: s.messages.createdAt }).from(s.messages)
        .innerJoin(s.teams, eq(s.teams.id, s.messages.teamId)).where(eq(s.messages.senderId, uid)).orderBy(asc(s.messages.createdAt)),
      tx.select({ task: s.tasks.title, comment: s.taskComments.body, at: s.taskComments.createdAt }).from(s.taskComments)
        .innerJoin(s.tasks, eq(s.tasks.id, s.taskComments.taskId)).where(eq(s.taskComments.authorId, uid)).orderBy(asc(s.taskComments.createdAt)),
      tx.select({ team: teamName, name: s.files.name, type: s.files.mimeType, bytes: s.files.sizeBytes, sharedAt: s.files.createdAt }).from(s.files)
        .innerJoin(s.teams, eq(s.teams.id, s.files.teamId)).where(eq(s.files.uploaderId, uid)).orderBy(asc(s.files.createdAt)),
      tx.select({ team: teamName, weekStart: s.standups.weekStart, done: s.standups.done, next: s.standups.next, blocked: s.standups.blocked }).from(s.standups)
        .innerJoin(s.teams, eq(s.teams.id, s.standups.teamId)).where(eq(s.standups.userId, uid)),
      tx.select({ about: s.users.name, rating: s.peerReviews.rating, categories: s.peerReviews.categoryRatings, feedback: s.peerReviews.feedback, at: s.peerReviews.createdAt })
        .from(s.peerReviews).leftJoin(s.users, eq(s.users.id, s.peerReviews.revieweeId)).where(eq(s.peerReviews.reviewerId, uid)),
      tx.select({ title: s.notifications.title, body: s.notifications.body, at: s.notifications.createdAt, readAt: s.notifications.readAt }).from(s.notifications)
        .where(eq(s.notifications.userId, uid)).orderBy(asc(s.notifications.createdAt)),
      tx.select({ startsAt: s.officeHours.startsAt, minutes: s.officeHours.minutes, location: s.officeHours.location, topic: s.officeHours.topic }).from(s.officeHours)
        .where(eq(s.officeHours.bookedBy, uid)),
      tx.select({ milestone: s.courseMilestones.title, newDate: s.deadlineExtensions.newDate, reason: s.deadlineExtensions.reason, status: s.deadlineExtensions.status })
        .from(s.deadlineExtensions).innerJoin(s.courseMilestones, eq(s.courseMilestones.id, s.deadlineExtensions.milestoneId)).where(eq(s.deadlineExtensions.requestedBy, uid)),
      tx.select({ team: teamName, agreedAt: s.charterAgreements.agreedAt }).from(s.charterAgreements)
        .innerJoin(s.teams, eq(s.teams.id, s.charterAgreements.teamId)).where(eq(s.charterAgreements.userId, uid)),
    ]);
    return {
      app: "ScholarSync", exportedAt: new Date().toISOString(),
      profile: { name: u.name, email: u.email, role: u.role, bio: u.bio, skills: u.skills, availability: u.availability, githubUsername: u.githubLogin,
        language: u.locale, dailyEmail: u.emailDigest, hasProfilePhoto: !!u.avatarPath, joinedAt: u.createdAt },
      courses, coursesTaught: taught, teams, tasks, messages, taskComments: comments, filesShared: files, standups,
      peerReviewsWritten: reviews, notifications, officeHoursBooked: officeHours, extensionRequests: extensions, charterAgreements: agreements,
    };
  });
}

/**
 * Deletes my account for good (Profile → Delete account), after I type my email to confirm. Removing the sign-in
 * (auth.users) cascades to the profile and everything personal: enrollments, team memberships, notifications, peer
 * reviews, stand-ups, grade factors, push devices. Shared team work stays with the team, unnamed: tasks, messages,
 * files, comments and hand-ins keep their rows with the person's column set to null ("Former member"). My profile
 * photo goes too. Instructors must delete their courses first (courses.instructor_id is "on delete restrict").
 */
export async function deleteAccount(confirmEmail: string): Promise<"deleted" | "wrong-email" | "has-courses"> {
  const me = await withUser(async (tx, uid) => {
    const [u] = await tx.select({ email: s.users.email, avatarPath: s.users.avatarPath }).from(s.users).where(eq(s.users.id, uid));
    const [taught] = await tx.select({ n: count() }).from(s.courses).where(eq(s.courses.instructorId, uid));
    return u && { ...u, id: uid, teaches: taught.n > 0 };
  });
  if (!me) throw new Error("Profile not found");
  if (z.string().trim().toLowerCase().parse(confirmEmail) !== me.email.toLowerCase()) return "wrong-email";
  if (me.teaches) return "has-courses";
  const supabase = await supabaseServer();
  if (me.avatarPath) await supabase.storage.from("avatars").remove([me.avatarPath]); // best effort: the account matters more
  // adminDb on purpose, after the identity check above: the rows clean up as a system change, so the triggers that
  // guard what a signed-in person may edit (hand-ins, extensions) and record who did what don't take it as theirs.
  await adminDb.execute(sql`delete from auth.users where id = ${me.id}`);
  await supabase.auth.signOut({ scope: "local" }).catch(() => {}); // clears this browser's session cookies
  return "deleted";
}

/** Points my profile at a photo I just uploaded, or removes it (null). Returns the previous path so its file can be deleted. */
export async function setAvatar(path: string | null): Promise<string | null> {
  return withUser(async (tx, uid) => {
    // Only a file in my own folder; the table's check constraint enforces the same.
    if (path !== null && !new RegExp(`^${uid}/[0-9a-f-]{36}\\.(png|jpe?g|webp|gif)$`).test(path)) throw new Error("Invalid photo");
    const [old] = await tx.select({ path: s.users.avatarPath }).from(s.users).where(eq(s.users.id, uid));
    await tx.update(s.users).set({ avatarPath: path }).where(eq(s.users.id, uid));
    return old?.path ?? null;
  });
}

const PushSubscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).default(""),
});

/** Saves this browser's push subscription for me (one row per browser; re-saving moves it to me). */
export async function savePushSubscription(input: z.input<typeof PushSubscriptionInput>) {
  const p = PushSubscriptionInput.parse(input);
  await withUser(async (tx, uid) => {
    // A browser shared by two accounts: the endpoint belongs to whoever turned alerts on last. RLS hides the other
    // account's row, so the owner role removes it; holding the endpoint (only this browser has it) is the proof.
    await adminDb.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.endpoint, p.endpoint), ne(s.pushSubscriptions.userId, uid)));
    await tx.insert(s.pushSubscriptions).values({ endpoint: p.endpoint, userId: uid, p256dh: p.keys.p256dh, auth: p.keys.auth, userAgent: p.userAgent })
      .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { p256dh: p.keys.p256dh, auth: p.keys.auth, userAgent: p.userAgent } });
  });
}

export async function removePushSubscription(endpoint: string) {
  const e = z.string().max(1000).parse(endpoint);
  await withUser((tx) => tx.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.endpoint, e)));
}

/** Emails me my current digest without marking anything as emailed, so I can see what it looks like. */
export async function sendSampleDigest(): Promise<number> {
  const uid = await withUser(async (_tx, uid) => uid);
  return sendDigestTo(uid, { sample: true });
}

/** Instructors: emails me this week's summary now (what the Monday email would say). 0 = nothing to look at. */
export async function sendSampleWeeklyDigest(): Promise<number> {
  const uid = await withUser(async (_tx, uid) => uid);
  return sendInstructorDigestTo(uid, { sample: true });
}

// ─── Teams ─────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  return withUser(async (tx) => {
    const rows = await tx.select({ t: s.teams, courseCode: s.courses.code, archivedAt: s.courses.archivedAt }).from(s.teams)
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

    return rows.map(({ t, courseCode, archivedAt }) => {
      const p = progress.find((x) => x.teamId === t.id);
      const done = p?.doneTasks ?? 0;
      return {
        id: t.id,
        courseId: t.courseId,
        courseCode,
        courseArchived: !!archivedAt,
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
  const L = await requestLocale();
  Id.parse(teamId);
  return withUser(async (tx, me) => {
    const rows = await tx
      .select({
        id: s.messages.id, senderId: s.messages.senderId, content: s.messages.content, timestamp: s.messages.createdAt,
        senderName: s.users.name, senderRole: s.users.role, fileName: s.files.name, fileBytes: s.files.sizeBytes, filePath: s.files.storagePath,
        replyId: s.messages.replyTo, parentContent: parent.content, parentFile: parentFile.name, parentSender: parentUser.name,
      })
      .from(s.messages)
      .leftJoin(s.users, eq(s.users.id, s.messages.senderId))
      .leftJoin(s.files, eq(s.files.id, s.messages.fileId))
      .leftJoin(parent, eq(parent.id, s.messages.replyTo))
      .leftJoin(parentUser, eq(parentUser.id, parent.senderId))
      .leftJoin(parentFile, eq(parentFile.id, parent.fileId))
      .where(eq(s.messages.teamId, teamId))
      .orderBy(desc(s.messages.createdAt))
      .limit(200);
    const reactions = rows.length ? await tx.select({ messageId: s.messageReactions.messageId, emoji: s.messageReactions.emoji, userId: s.messageReactions.userId, name: s.users.name })
      .from(s.messageReactions).leftJoin(s.users, eq(s.users.id, s.messageReactions.userId))
      .where(inArray(s.messageReactions.messageId, rows.map((r) => r.id))).orderBy(asc(s.messageReactions.createdAt)) : [];
    return rows.reverse().map((r) => ({
      id: r.id,
      senderId: r.senderId ?? "",
      senderName: r.senderName ?? translate(L, "Former member"),
      fromInstructor: r.senderRole === "instructor",
      content: r.content,
      timestamp: r.timestamp,
      fileName: r.fileName,
      fileSize: r.fileBytes == null ? null : fmtSize(r.fileBytes),
      filePath: r.filePath,
      replyTo: r.replyId ? { id: r.replyId, senderName: r.parentSender ?? translate(L, "Former member"), snippet: (r.parentContent || (r.parentFile ? `📎 ${r.parentFile}` : "")).slice(0, 140) } : null,
      reactions: REACTIONS.map((emoji) => {
        const list = reactions.filter((x) => x.messageId === r.id && x.emoji === emoji);
        return { emoji, count: list.length, mine: list.some((x) => x.userId === me), names: list.map((x) => x.name ?? translate(L, "Former member")) };
      }).filter((x) => x.count > 0),
    }));
  });
}

const MessageInput = z.object({ teamId: Id, content: z.string().trim().max(4000), fileId: Id.optional(), replyTo: Id.optional() })
  .refine((m) => m.content || m.fileId, "Message is empty");

export async function sendMessage(teamId: string, content: string, fileId?: string, replyTo?: string) {
  const m = MessageInput.parse({ teamId, content, fileId, replyTo });
  // RLS checks that a reply answers a message in the same team.
  const [row] = await withUser((tx) =>
    tx.insert(s.messages).values({ teamId: m.teamId, content: m.content, fileId: m.fileId, replyTo: m.replyTo }).returning({ id: s.messages.id }),
  );
  try {
    await inngest.send({ name: "chat/message.created", data: { teamId: m.teamId, messageId: row.id } });
  } catch (err) {
    // The message is saved; only the AI task extraction is skipped.
    console.error("Inngest unavailable, task extraction skipped:", err);
  }
}

/** Adds my reaction to a message, or takes it back if I already reacted with that emoji. */
export async function toggleReaction(messageId: string, emoji: string) {
  Id.parse(messageId);
  const e = z.enum(REACTIONS).parse(emoji);
  await withUser(async (tx, uid) => {
    const removed = await tx.delete(s.messageReactions)
      .where(and(eq(s.messageReactions.messageId, messageId), eq(s.messageReactions.userId, uid), eq(s.messageReactions.emoji, e)))
      .returning({ id: s.messageReactions.messageId });
    if (removed.length) return;
    const [msg] = await tx.select({ teamId: s.messages.teamId }).from(s.messages).where(eq(s.messages.id, messageId));
    if (!msg) throw new Error("Message not found");
    await tx.insert(s.messageReactions).values({ messageId, userId: uid, teamId: msg.teamId, emoji: e });
  });
}

/** Messages and files in a team whose text or name contains `query` (any case), newest first. RLS limits it to teams I can see. */
export async function searchTeam(teamId: string, query: string): Promise<ChatSearchHit[]> {
  const L = await requestLocale();
  Id.parse(teamId);
  const q = z.string().trim().min(2).max(100).parse(query);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return withUser(async (tx) => {
    const msgs = await tx.select({ id: s.messages.id, content: s.messages.content, timestamp: s.messages.createdAt, senderName: s.users.name })
      .from(s.messages).leftJoin(s.users, eq(s.users.id, s.messages.senderId))
      .where(and(eq(s.messages.teamId, teamId), ilike(s.messages.content, like))).orderBy(desc(s.messages.createdAt)).limit(30);
    const files = await tx.select({ id: s.files.id, name: s.files.name, path: s.files.storagePath, bytes: s.files.sizeBytes, timestamp: s.files.createdAt, by: s.users.name })
      .from(s.files).leftJoin(s.users, eq(s.users.id, s.files.uploaderId))
      .where(and(eq(s.files.teamId, teamId), ilike(s.files.name, like))).orderBy(desc(s.files.createdAt)).limit(15);
    return [
      ...files.map((f) => ({ kind: "file" as const, id: f.id, name: f.name, storagePath: f.path, size: fmtSize(f.bytes), uploadedBy: f.by ?? translate(L, "Former member"), timestamp: f.timestamp })),
      ...msgs.map((m) => ({ kind: "message" as const, id: m.id, content: m.content, timestamp: m.timestamp, senderName: m.senderName ?? translate(L, "Former member") })),
    ];
  });
}

/**
 * Search for the command menu: tasks, messages, files, milestones and announcements in every course and team the
 * person can see. RLS decides what that is, so a student only finds their own teams' work. A few hits per kind.
 */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const L = await requestLocale();
  const q = z.string().trim().min(2).max(100).parse(query);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const PER_KIND = 6;
  return withUser(async (tx) => {
    const team = { teamId: s.teams.id, teamName: s.teams.name, courseId: s.teams.courseId };
    const [tasks, msgs, files, milestones, news] = await Promise.all([
      tx.select({ id: s.tasks.id, text: s.tasks.title, at: s.tasks.updatedAt, ...team }).from(s.tasks)
        .innerJoin(s.teams, eq(s.teams.id, s.tasks.teamId))
        .where(or(ilike(s.tasks.title, like), ilike(s.tasks.description, like))).orderBy(desc(s.tasks.updatedAt)).limit(PER_KIND),
      tx.select({ id: s.messages.id, text: s.messages.content, at: s.messages.createdAt, by: s.users.name, ...team }).from(s.messages)
        .innerJoin(s.teams, eq(s.teams.id, s.messages.teamId)).leftJoin(s.users, eq(s.users.id, s.messages.senderId))
        .where(ilike(s.messages.content, like)).orderBy(desc(s.messages.createdAt)).limit(PER_KIND),
      tx.select({ id: s.files.id, text: s.files.name, at: s.files.createdAt, path: s.files.storagePath, by: s.users.name, ...team }).from(s.files)
        .innerJoin(s.teams, eq(s.teams.id, s.files.teamId)).leftJoin(s.users, eq(s.users.id, s.files.uploaderId))
        .where(ilike(s.files.name, like)).orderBy(desc(s.files.createdAt)).limit(PER_KIND),
      tx.select({ id: s.courseMilestones.id, text: s.courseMilestones.title, at: s.courseMilestones.createdAt, courseId: s.courseMilestones.courseId, code: s.courses.code })
        .from(s.courseMilestones).innerJoin(s.courses, eq(s.courses.id, s.courseMilestones.courseId))
        .where(or(ilike(s.courseMilestones.title, like), ilike(s.courseMilestones.description, like))).orderBy(desc(s.courseMilestones.dueDate)).limit(PER_KIND),
      tx.select({ id: s.courseAnnouncements.id, text: s.courseAnnouncements.title, at: s.courseAnnouncements.createdAt, courseId: s.courseAnnouncements.courseId, code: s.courses.code })
        .from(s.courseAnnouncements).innerJoin(s.courses, eq(s.courses.id, s.courseAnnouncements.courseId))
        .where(or(ilike(s.courseAnnouncements.title, like), ilike(s.courseAnnouncements.body, like))).orderBy(desc(s.courseAnnouncements.createdAt)).limit(PER_KIND),
    ]);
    const who = (name: string | null) => name ?? translate(L, "Former member");
    return [
      ...tasks.map((x) => ({ kind: "task" as const, id: x.id, text: x.text, where: x.teamName, teamId: x.teamId, courseId: x.courseId, at: x.at })),
      ...msgs.map((x) => ({ kind: "message" as const, id: x.id, text: x.text, where: `${x.teamName} · ${who(x.by)}`, teamId: x.teamId, courseId: x.courseId, at: x.at })),
      ...files.map((x) => ({ kind: "file" as const, id: x.id, text: x.text, where: `${x.teamName} · ${who(x.by)}`, teamId: x.teamId, courseId: x.courseId, storagePath: x.path, at: x.at })),
      ...milestones.map((x) => ({ kind: "milestone" as const, id: x.id, text: x.text, where: x.code, teamId: null, courseId: x.courseId, at: x.at })),
      ...news.map((x) => ({ kind: "announcement" as const, id: x.id, text: x.text, where: x.code, teamId: null, courseId: x.courseId, at: x.at })),
    ];
  });
}

/** AI-picked meeting times from the members' availability. Members only (RLS on team_members). */
export async function suggestMeetingTimes(teamId: string): Promise<MeetingSlot[]> {
  Id.parse(teamId);
  const { members, deadlines } = await withUser(async (tx, uid) => {
    const members = await tx.select({ id: s.users.id, name: s.users.name, availability: s.users.availability })
      .from(s.teamMembers).innerJoin(s.users, eq(s.users.id, s.teamMembers.userId)).where(eq(s.teamMembers.teamId, teamId));
    if (!members.some((m) => m.id === uid)) throw new Error("Only team members can schedule a meeting");
    const deadlines = await tx.select({ d: s.tasks.dueDate }).from(s.tasks)
      .where(and(eq(s.tasks.teamId, teamId), ne(s.tasks.status, "done"), sql`${s.tasks.dueDate} between current_date and current_date + 14`));
    return { members, deadlines: [...new Set(deadlines.map((r) => r.d!))].sort() };
  });
  const today = new Date().toISOString().slice(0, 10);
  return suggestMeetings(members.map((m) => ({ name: m.name, availability: m.availability })), today, deadlines);
}

// ─── Tasks ─────────────────────────────────────────────────────────────

export async function getTasks(teamId: string): Promise<KanbanTask[]> {
  const L = await requestLocale();
  Id.parse(teamId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({
        t: s.tasks, assigneeName: s.users.name,
        commentCount: sql<number>`(select count(*) from public.task_comments c where c.task_id = ${s.tasks.id})::int`,
        checklist: sql<[number, number]>`(select array[count(*) filter (where i.done), count(*)]::int[] from public.task_checklist_items i where i.task_id = ${s.tasks.id})`,
        focusMinutes: sql<number>`(select coalesce(sum(f.minutes), 0) from public.focus_sessions f where f.task_id = ${s.tasks.id})::int`,
        blockedBy: sql<string[]>`(select coalesce(array_agg(d.blocked_by), '{}') from public.task_dependencies d where d.task_id = ${s.tasks.id})`,
      })
      .from(s.tasks)
      .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
      .where(eq(s.tasks.teamId, teamId))
      .orderBy(asc(s.tasks.position));
    return rows.map(({ t, assigneeName, commentCount, checklist, focusMinutes, blockedBy }) => ({
      id: t.id, title: t.title, description: t.description, status: toUiStatus(t.status), priority: t.priority,
      assigneeId: t.assigneeId, assigneeName: assigneeName ?? translate(L, "Unassigned"), dueDate: t.dueDate, commentCount,
      checklistDone: checklist[0], checklistTotal: checklist[1], focusMinutes, blockedBy,
    }));
  });
}

/** Makes a task wait on another task of its team, or stops it waiting. Returns "loop" when the other task already waits on this one. */
export async function setTaskBlocker(taskId: string, blockedBy: string, blocked: boolean): Promise<"ok" | "loop"> {
  Id.parse(taskId); Id.parse(blockedBy);
  try {
    await withUser(async (tx) => {
      if (!blocked) {
        await tx.delete(s.taskDependencies).where(and(eq(s.taskDependencies.taskId, taskId), eq(s.taskDependencies.blockedBy, blockedBy)));
        return;
      }
      const [task] = await tx.select({ teamId: s.tasks.teamId }).from(s.tasks).where(eq(s.tasks.id, taskId));
      if (!task) throw new Error("Task not found");
      await tx.insert(s.taskDependencies).values({ taskId, blockedBy, teamId: task.teamId }).onConflictDoNothing();
    });
  } catch (err) {
    // Drizzle wraps the database error; its cause has the trigger's message (0038).
    if (/wait on each other/.test(String((err as { cause?: unknown }).cause ?? ""))) return "loop";
    throw err;
  }
  return "ok";
}

/** Saves a finished (or stopped) focus-timer session on a task. The database stamps the end time and refuses overlaps. */
export async function logFocus(taskId: string, minutes: number) {
  Id.parse(taskId);
  const m = z.number().int().min(1).max(60).parse(minutes);
  await withUser(async (tx, uid) => {
    const [task] = await tx.select({ teamId: s.tasks.teamId }).from(s.tasks).where(eq(s.tasks.id, taskId));
    if (!task) throw new Error("Task not found");
    await tx.insert(s.focusSessions).values({ taskId, teamId: task.teamId, userId: uid, minutes: m });
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

/** Action items from meeting notes, for the student to review before they become tasks. Members only. */
export async function extractNoteTasks(teamId: string, notes: string): Promise<ActionItem[]> {
  Id.parse(teamId);
  const text = z.string().trim().min(10, "Paste a few lines of notes").max(10_000).parse(notes);
  const members = await withUser(async (tx, uid) => {
    const rows = await tx.select({ id: s.users.id, name: s.users.name }).from(s.teamMembers)
      .innerJoin(s.users, eq(s.users.id, s.teamMembers.userId)).where(eq(s.teamMembers.teamId, teamId));
    if (!rows.some((m) => m.id === uid)) throw new Error("Only team members can add tasks");
    return rows;
  });
  const today = new Date().toISOString().slice(0, 10);
  const raw = await extractActionItems(text, members.map((m) => m.name), today);
  if (!raw) throw new Error("The AI returned nothing");
  return cleanActionItems(raw, members, today);
}

/** Adds several tasks at once (from meeting notes), all or none. */
export async function createTasks(teamId: string, input: { title: string; description: string; priority: string; dueDate: string; assigneeId: string }[]) {
  Id.parse(teamId);
  const items = z.array(TaskFields.omit({ status: true })).min(1).max(MAX_ACTION_ITEMS).parse(input);
  const now = Date.now();
  await withUser((tx) => tx.insert(s.tasks).values(items.map((t, i) => ({ ...t, teamId, position: now + i }))));
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
  const L = await requestLocale();
  Id.parse(taskId);
  return withUser(async (tx) => {
    const rows = await tx
      .select({ c: s.taskComments, authorName: s.users.name })
      .from(s.taskComments)
      .leftJoin(s.users, eq(s.users.id, s.taskComments.authorId))
      .where(eq(s.taskComments.taskId, taskId))
      .orderBy(asc(s.taskComments.createdAt));
    return rows.map(({ c, authorName }) => ({ id: c.id, authorId: c.authorId, authorName: authorName ?? translate(L, "Former member"), body: c.body, createdAt: c.createdAt }));
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

export async function getTaskHistory(taskId: string): Promise<TaskEvent[]> {
  Id.parse(taskId);
  return withUser(async (tx) => {
    const rows = await tx.select({ e: s.taskEvents, actorName: s.users.name }).from(s.taskEvents)
      .leftJoin(s.users, eq(s.users.id, s.taskEvents.actorId))
      .where(eq(s.taskEvents.taskId, taskId)).orderBy(desc(s.taskEvents.createdAt), desc(s.taskEvents.id)).limit(100);
    return rows.map(({ e, actorName }) => ({
      id: e.id, actorName, field: e.field as TaskEvent["field"], oldValue: e.oldValue, newValue: e.newValue, createdAt: e.createdAt,
    }));
  });
}

// ─── Checklists ────────────────────────────────────────────────────────

export async function getChecklist(taskId: string): Promise<ChecklistItem[]> {
  Id.parse(taskId);
  return withUser((tx) => tx.select({ id: s.taskChecklistItems.id, body: s.taskChecklistItems.body, done: s.taskChecklistItems.done })
    .from(s.taskChecklistItems).where(eq(s.taskChecklistItems.taskId, taskId))
    .orderBy(asc(s.taskChecklistItems.position), asc(s.taskChecklistItems.createdAt)));
}

export async function addChecklistItem(taskId: string, body: string) {
  Id.parse(taskId);
  const text = z.string().trim().min(1).max(200).parse(body);
  await withUser((tx) => tx.insert(s.taskChecklistItems).values({
    taskId, body: text,
    position: sql`(select coalesce(max(position), -1) + 1 from public.task_checklist_items where task_id = ${taskId})`,
  }));
}

export async function setChecklistItemDone(id: string, done: boolean) {
  Id.parse(id);
  await withUser((tx) => tx.update(s.taskChecklistItems).set({ done: z.boolean().parse(done) }).where(eq(s.taskChecklistItems.id, id)));
}

export async function deleteChecklistItem(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.delete(s.taskChecklistItems).where(eq(s.taskChecklistItems.id, id)));
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

// ─── Weekly stand-up ───────────────────────────────────────────────────

/** This week's answers for a team, its members, and (instructors only, by RLS) the AI summary. */
export async function getStandup(teamId: string): Promise<TeamStandup> {
  Id.parse(teamId);
  const week = currentWeekStart();
  return withUser(async (tx) => {
    const [members, answers, [summary]] = await Promise.all([
      tx.select({ userId: s.users.id, name: s.users.name }).from(s.teamMembers).innerJoin(s.users, eq(s.users.id, s.teamMembers.userId))
        .where(eq(s.teamMembers.teamId, teamId)).orderBy(asc(s.users.name)),
      tx.select({ userId: s.standups.userId, name: s.users.name, done: s.standups.done, next: s.standups.next, blocked: s.standups.blocked, updatedAt: s.standups.updatedAt })
        .from(s.standups).innerJoin(s.users, eq(s.users.id, s.standups.userId))
        .where(and(eq(s.standups.teamId, teamId), eq(s.standups.weekStart, week))).orderBy(asc(s.standups.updatedAt)),
      tx.select({ summary: s.standupSummaries.summary, blockers: s.standupSummaries.blockers, answered: s.standupSummaries.answered, generatedAt: s.standupSummaries.generatedAt })
        .from(s.standupSummaries).where(and(eq(s.standupSummaries.teamId, teamId), eq(s.standupSummaries.weekStart, week))),
    ]);
    const inTeam = new Set(members.map((m) => m.userId));
    return { weekStart: week, members, answers: answers.filter((a) => inTeam.has(a.userId)), summary: summary ?? null };
  });
}

const StandupForm = z.object({
  done: z.string().trim().max(1000),
  next: z.string().trim().max(1000),
  blocked: z.string().trim().max(1000),
}).refine((f) => f.done || f.next || f.blocked, "Answer at least one question");

/** Saves my answers for this week (answering again replaces them), then queues the instructor's summary. */
export async function saveStandup(teamId: string, form: { done: string; next: string; blocked: string }) {
  Id.parse(teamId);
  const f = StandupForm.parse(form);
  const row = { ...f, updatedAt: new Date().toISOString() };
  await withUser((tx, uid) => tx.insert(s.standups).values({ teamId, userId: uid, weekStart: currentWeekStart(), ...row })
    .onConflictDoUpdate({ target: [s.standups.teamId, s.standups.userId, s.standups.weekStart], set: row }));
  try {
    await inngest.send({ name: "standup/answered", data: { teamId } });
  } catch (err) {
    // The answers are saved; the summary is written when the instructor asks for it.
    console.error("Queueing the stand-up summary failed:", err);
  }
}

const STANDUP_COOLDOWN_MS = 2 * 60 * 1000;

/** The instructor asks for the summary now. "empty" = nobody has answered yet; "cooldown" = one was just written. */
export async function refreshStandupSummary(teamId: string): Promise<"ok" | "cooldown" | "empty"> {
  Id.parse(teamId);
  const recent = await withUser(async (tx, uid) => {
    const [team] = await tx.select({ id: s.teams.id }).from(s.teams).innerJoin(s.courses, eq(s.courses.id, s.teams.courseId))
      .where(and(eq(s.teams.id, teamId), eq(s.courses.instructorId, uid)));
    if (!team) throw new Error("Only the course instructor can do this");
    const [r] = await tx.select({ at: s.standupSummaries.generatedAt }).from(s.standupSummaries)
      .where(and(eq(s.standupSummaries.teamId, teamId), eq(s.standupSummaries.weekStart, currentWeekStart())));
    return r?.at;
  });
  if (recent && Date.now() - new Date(recent).getTime() < STANDUP_COOLDOWN_MS) return "cooldown";
  return (await summarizeTeamStandup(teamId)) ? "ok" : "empty";
}

// ─── Milestones (instructors set them per course; teams mark them done) ─

export async function getMilestones(courseId: string): Promise<Milestone[]> {
  Id.parse(courseId);
  return withUser(async (tx) => {
    const ms = await tx.select().from(s.courseMilestones).where(eq(s.courseMilestones.courseId, courseId))
      .orderBy(asc(s.courseMilestones.dueDate), asc(s.courseMilestones.createdAt));
    if (!ms.length) return [];
    // RLS shows a student only their own team's completions and hand-ins, and the instructor every team's.
    const ids = ms.map((m) => m.id);
    const done = await tx.select().from(s.teamMilestones).where(inArray(s.teamMilestones.milestoneId, ids));
    const subs = await tx.select({ sub: s.submissions, by: s.users.name }).from(s.submissions)
      .leftJoin(s.users, eq(s.users.id, s.submissions.submittedBy)).where(inArray(s.submissions.milestoneId, ids));
    const exts = await tx.select({ x: s.deadlineExtensions, by: s.users.name }).from(s.deadlineExtensions)
      .leftJoin(s.users, eq(s.users.id, s.deadlineExtensions.requestedBy)).where(inArray(s.deadlineExtensions.milestoneId, ids));
    const retros = await tx.select({ teamId: s.teamRetros.teamId, milestoneId: s.teamRetros.milestoneId }).from(s.teamRetros)
      .where(inArray(s.teamRetros.milestoneId, ids));
    return ms.map((m) => ({
      id: m.id, title: m.title, description: m.description, dueDate: m.dueDate, requiresSubmission: m.requiresSubmission,
      completions: done.filter((d) => d.milestoneId === m.id).map((d) => ({ teamId: d.teamId, completedAt: d.completedAt })),
      submissions: subs.filter((x) => x.sub.milestoneId === m.id).map(({ sub, by }) => ({
        teamId: sub.teamId, link: sub.link, storagePath: sub.storagePath, fileName: sub.fileName, fileSize: sub.fileSize, note: sub.note,
        submittedByName: by ?? "A teammate", submittedAt: sub.submittedAt, feedback: sub.feedback, feedbackAt: sub.feedbackAt,
      })),
      extensions: exts.filter((e) => e.x.milestoneId === m.id).map(({ x, by }) => ({
        teamId: x.teamId, newDate: x.newDate, reason: x.reason, status: x.status, approvedDate: x.approvedDate,
        requestedByName: by ?? "A teammate", requestedAt: x.requestedAt,
      })),
      retroTeams: retros.filter((r) => r.milestoneId === m.id).map((r) => r.teamId),
    }));
  });
}

// ─── Retrospectives ───────────────────────────────────────────────────

/** The retrospectives on a milestone: the student's own team's, or every team's for the instructor (RLS). */
export async function getRetros(milestoneId: string): Promise<TeamRetro[]> {
  const L = await requestLocale();
  Id.parse(milestoneId);
  return withUser(async (tx) => {
    const rows = await tx.select({ r: s.teamRetros, team: s.teams.name, by: s.users.name }).from(s.teamRetros)
      .innerJoin(s.teams, eq(s.teams.id, s.teamRetros.teamId)).leftJoin(s.users, eq(s.users.id, s.teamRetros.updatedBy))
      .where(eq(s.teamRetros.milestoneId, milestoneId)).orderBy(asc(s.teams.name));
    return rows.map(({ r, team, by }) => ({ teamId: r.teamId, teamName: team, wentWell: r.wentWell, didnt: r.didnt,
      updatedByName: by ?? translate(L, "Former member"), updatedAt: r.updatedAt }));
  });
}

const RetroInput = z.object({ wentWell: z.string().trim().max(2000), didnt: z.string().trim().max(2000) })
  .refine((r) => r.wentWell || r.didnt, "Write at least one of the two");

/** Saves the team's retrospective on a milestone (one shared answer per team; any member edits it). */
export async function saveRetro(teamId: string, milestoneId: string, input: z.input<typeof RetroInput>) {
  Id.parse(teamId); Id.parse(milestoneId);
  const r = RetroInput.parse(input);
  await withUser((tx) => tx.insert(s.teamRetros).values({ teamId, milestoneId, ...r })
    .onConflictDoUpdate({ target: [s.teamRetros.teamId, s.teamRetros.milestoneId], set: { wentWell: r.wentWell, didnt: r.didnt } }));
}

/** Instructor: themes across the teams' retrospectives on a milestone, found by the AI. Needs two or more. */
export async function findRetroThemes(milestoneId: string): Promise<RetroThemes> {
  Id.parse(milestoneId);
  const L = await requestLocale();
  const retros = await withUser(async (tx, uid) => {
    const [m] = await tx.select({ courseId: s.courseMilestones.courseId }).from(s.courseMilestones).where(eq(s.courseMilestones.id, milestoneId));
    if (!m) throw new Error("Milestone not found");
    await staffCourse(tx, uid, m.courseId);
    return tx.select({ team: s.teams.name, wentWell: s.teamRetros.wentWell, didnt: s.teamRetros.didnt }).from(s.teamRetros)
      .innerJoin(s.teams, eq(s.teams.id, s.teamRetros.teamId)).where(eq(s.teamRetros.milestoneId, milestoneId));
  });
  if (retros.length < 2) throw new Error("Themes need at least two retrospectives");
  const themes = await summarizeRetros(retros, L);
  if (!themes) throw new Error("The AI returned nothing");
  const names = new Set(retros.map((r) => r.team)); // keep only real team names
  const clean = (xs: { theme: string; teams: string[] }[]) => xs.map((x) => ({ theme: x.theme, teams: x.teams.filter((n) => names.has(n)) }));
  return { wentWell: clean(themes.went_well), didnt: clean(themes.didnt) };
}

const MilestoneInput = z.object({
  title: z.string().trim().min(1, "Give the milestone a title").max(120),
  description: z.string().trim().max(1000),
  dueDate: z.iso.date(),
  requiresSubmission: z.boolean().default(false),
});

export async function saveMilestone(courseId: string, input: z.input<typeof MilestoneInput>, id?: string) {
  Id.parse(courseId);
  const m = MilestoneInput.parse(input);
  await withUser(async (tx) => {
    if (!id) return tx.insert(s.courseMilestones).values({ ...m, courseId });
    Id.parse(id);
    const updated = await tx.update(s.courseMilestones).set(m).where(eq(s.courseMilestones.id, id)).returning({ id: s.courseMilestones.id });
    if (!updated.length) throw new Error("Milestone not found");
  });
}

export async function deleteMilestone(id: string) {
  Id.parse(id);
  // Remove the hand-in files first: the rows cascade away with the milestone, the stored files wouldn't.
  const paths = await withUser((tx) => tx.select({ path: s.submissions.storagePath }).from(s.submissions)
    .where(and(eq(s.submissions.milestoneId, id), isNotNull(s.submissions.storagePath))));
  if (paths.length) {
    const { error } = await (await supabaseServer()).storage.from("team-files").remove(paths.map((p) => p.path as string));
    if (error) throw new Error(`Could not remove the hand-in files: ${error.message}`);
  }
  await withUser((tx) => tx.delete(s.courseMilestones).where(eq(s.courseMilestones.id, id)));
}

// ─── Announcements ─────────────────────────────────────────────────────

export async function getAnnouncements(courseId: string): Promise<Announcement[]> {
  const L = await requestLocale();
  Id.parse(courseId);
  return withUser(async (tx) => {
    const rows = await tx.select({ a: s.courseAnnouncements, authorName: s.users.name }).from(s.courseAnnouncements)
      .leftJoin(s.users, eq(s.users.id, s.courseAnnouncements.authorId))
      .where(eq(s.courseAnnouncements.courseId, courseId)).orderBy(desc(s.courseAnnouncements.createdAt));
    return rows.map(({ a, authorName }) => ({ id: a.id, title: a.title, body: a.body, authorName: authorName ?? translate(L, "Instructor"), createdAt: a.createdAt }));
  });
}

const AnnouncementInput = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(4000) });

export async function postAnnouncement(courseId: string, input: z.input<typeof AnnouncementInput>) {
  Id.parse(courseId);
  const a = AnnouncementInput.parse(input);
  await withUser((tx, uid) => tx.insert(s.courseAnnouncements).values({ ...a, courseId, authorId: uid }));
}

export async function deleteAnnouncement(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.delete(s.courseAnnouncements).where(eq(s.courseAnnouncements.id, id)));
}

// ─── Peer help board (students ask the course; anyone in it answers) ───

export async function getHelpBoard(courseId: string): Promise<HelpQuestion[]> {
  const L = await requestLocale();
  Id.parse(courseId);
  return withUser(async (tx) => {
    const [course] = await tx.select({ instructorId: s.courses.instructorId }).from(s.courses).where(eq(s.courses.id, courseId));
    const qs = await tx.select({ q: s.helpQuestions, name: s.users.name }).from(s.helpQuestions).leftJoin(s.users, eq(s.users.id, s.helpQuestions.authorId))
      .where(eq(s.helpQuestions.courseId, courseId)).orderBy(desc(s.helpQuestions.createdAt)).limit(100);
    if (!qs.length) return [];
    const ans = await tx.select({ a: s.helpAnswers, name: s.users.name }).from(s.helpAnswers).leftJoin(s.users, eq(s.users.id, s.helpAnswers.authorId))
      .where(inArray(s.helpAnswers.questionId, qs.map(({ q }) => q.id))).orderBy(asc(s.helpAnswers.createdAt));
    const who = (name: string | null) => name ?? translate(L, "Former member");
    return qs.map(({ q, name }) => ({
      id: q.id, title: q.title, body: q.body, authorId: q.authorId, authorName: who(name), createdAt: q.createdAt, solvedBy: q.solvedBy,
      answers: ans.filter(({ a }) => a.questionId === q.id).map(({ a, name: n }) => ({
        id: a.id, body: a.body, authorId: a.authorId, authorName: who(n), byInstructor: !!a.authorId && a.authorId === course?.instructorId, createdAt: a.createdAt,
      })),
    }));
  });
}

const HelpInput = z.object({ title: z.string().trim().min(1, "Write your question").max(160), body: z.string().trim().max(4000) });

export async function askQuestion(courseId: string, input: z.input<typeof HelpInput>) {
  Id.parse(courseId);
  const q = HelpInput.parse(input);
  await withUser((tx, uid) => tx.insert(s.helpQuestions).values({ ...q, courseId, authorId: uid }));
}

export async function answerQuestion(questionId: string, body: string) {
  Id.parse(questionId);
  const text = z.string().trim().min(1).max(4000).parse(body);
  await withUser((tx, uid) => tx.insert(s.helpAnswers).values({ questionId, body: text, authorId: uid }));
}

/** The asker marks the answer that solved it (null: none). RLS lets only the asker change it. */
export async function markSolution(questionId: string, answerId: string | null) {
  Id.parse(questionId);
  if (answerId) Id.parse(answerId);
  const updated = await withUser((tx) => tx.update(s.helpQuestions).set({ solvedBy: answerId }).where(eq(s.helpQuestions.id, questionId)).returning({ id: s.helpQuestions.id }));
  if (!updated.length) throw new Error("Only the person who asked can mark the solution");
}

export async function deleteHelpPost(kind: "question" | "answer", id: string) {
  Id.parse(id);
  const table = kind === "question" ? s.helpQuestions : s.helpAnswers;
  await withUser((tx) => tx.delete(table).where(eq(table.id, id)));
}

const SubmissionInput = z.object({
  link: z.url({ protocol: /^https?$/, message: "Use a web link starting with http:// or https://" }).max(2000).nullable(),
  file: z.object({ path: z.string().max(500), name: z.string().trim().min(1).max(255), size: z.number().int().min(0) }).nullable(),
  note: z.string().trim().max(2000),
}).refine((v) => v.link || v.file, "Attach a file or add a link");

/**
 * Hands in (or replaces) my team's work for a milestone and marks the milestone done. The file is already in
 * storage under the team's folder; returns the replaced file's path so the caller can remove it.
 */
/** The course's grading criteria as a checklist for one team's hand-in. Team members and the instructor (RLS). */
export async function getRubricChecks(teamId: string, milestoneId: string): Promise<RubricCheck[]> {
  const L = await requestLocale();
  Id.parse(teamId); Id.parse(milestoneId);
  return withUser(async (tx) => {
    const rows = await tx.select({ id: s.rubricCriteria.id, name: s.rubricCriteria.name, maxPoints: s.rubricCriteria.maxPoints, checkedBy: s.users.name, checked: s.rubricChecks.criterionId })
      .from(s.rubricCriteria)
      .innerJoin(s.teams, and(eq(s.teams.courseId, s.rubricCriteria.courseId), eq(s.teams.id, teamId)))
      .leftJoin(s.rubricChecks, and(eq(s.rubricChecks.criterionId, s.rubricCriteria.id), eq(s.rubricChecks.teamId, teamId), eq(s.rubricChecks.milestoneId, milestoneId)))
      .leftJoin(s.users, eq(s.users.id, s.rubricChecks.checkedBy))
      .orderBy(asc(s.rubricCriteria.position), asc(s.rubricCriteria.createdAt));
    return rows.map((r) => ({ id: r.id, name: r.name, maxPoints: r.maxPoints, checkedBy: r.checked ? (r.checkedBy ?? translate(L, "Former member")) : null }));
  });
}

/** Ticks or unticks a criterion on the team's hand-in checklist. */
export async function setRubricCheck(teamId: string, milestoneId: string, criterionId: string, checked: boolean) {
  Id.parse(teamId); Id.parse(milestoneId); Id.parse(criterionId);
  await withUser(async (tx, uid) => {
    const key = and(eq(s.rubricChecks.teamId, teamId), eq(s.rubricChecks.milestoneId, milestoneId), eq(s.rubricChecks.criterionId, criterionId));
    if (checked) await tx.insert(s.rubricChecks).values({ teamId, milestoneId, criterionId, checkedBy: uid }).onConflictDoNothing();
    else await tx.delete(s.rubricChecks).where(key);
  });
}

export async function submitWork(teamId: string, milestoneId: string, input: z.input<typeof SubmissionInput>): Promise<string | null> {
  Id.parse(teamId);
  Id.parse(milestoneId);
  const v = SubmissionInput.parse(input);
  if (v.file && !v.file.path.startsWith(`${teamId}/submissions/`)) throw new Error("Invalid file");
  return withUser(async (tx) => {
    const [old] = await tx.select({ path: s.submissions.storagePath }).from(s.submissions)
      .where(and(eq(s.submissions.teamId, teamId), eq(s.submissions.milestoneId, milestoneId)));
    const row = { link: v.link, storagePath: v.file?.path ?? null, fileName: v.file?.name ?? null, fileSize: v.file?.size ?? null, note: v.note };
    // RLS checks team membership and that the milestone takes hand-ins; a trigger stamps who and when.
    await tx.insert(s.submissions).values({ teamId, milestoneId, ...row })
      .onConflictDoUpdate({ target: [s.submissions.teamId, s.submissions.milestoneId], set: { ...row, submittedAt: sql`now()` } });
    await tx.insert(s.teamMilestones).values({ teamId, milestoneId }).onConflictDoNothing();
    return old?.path && old.path !== row.storagePath ? old.path : null;
  });
}

/** Instructor: written feedback on a team's hand-in. A trigger keeps the hand-in itself unchanged. */
export async function saveSubmissionFeedback(teamId: string, milestoneId: string, feedback: string) {
  Id.parse(teamId);
  Id.parse(milestoneId);
  const text = z.string().trim().max(4000).parse(feedback);
  const rows = await withUser((tx) => tx.update(s.submissions).set({ feedback: text })
    .where(and(eq(s.submissions.teamId, teamId), eq(s.submissions.milestoneId, milestoneId), sql`public.staffs_team(${s.submissions.teamId})`))
    .returning({ teamId: s.submissions.teamId }));
  if (!rows.length) throw new Error("Submission not found or not your course");
}

/**
 * Staff: pairs of hand-ins on a milestone that share a link or whose text overlaps a lot (the note, plus the contents of
 * small text files). A hint for the instructor to look closer, not a verdict. Reads files as the user (storage RLS).
 */
export async function getSimilarityHints(milestoneId: string): Promise<SimilarPair[]> {
  Id.parse(milestoneId);
  const subs = await withUser(async (tx, uid) => {
    const [m] = await tx.select({ courseId: s.courseMilestones.courseId }).from(s.courseMilestones).where(eq(s.courseMilestones.id, milestoneId));
    if (!m) throw new Error("Milestone not found");
    await staffCourse(tx, uid, m.courseId);
    return tx.select().from(s.submissions).where(eq(s.submissions.milestoneId, milestoneId));
  });
  const bucket = (await supabaseServer()).storage.from("team-files");
  const items = await Promise.all(subs.map(async (x) => {
    let text = x.note;
    if (x.storagePath && x.fileName && (x.fileSize ?? Infinity) <= MAX_READ && TEXT_FILE.test(x.fileName)) {
      const { data } = await bucket.download(x.storagePath);
      if (data) text += `\n${await data.text()}`;
    }
    return { id: x.teamId, text, link: x.link };
  }));
  return similarPairs(items);
}

export async function setMilestoneDone(teamId: string, milestoneId: string, done: boolean) {
  Id.parse(teamId);
  Id.parse(milestoneId);
  await withUser(async (tx) => {
    if (done) await tx.insert(s.teamMilestones).values({ teamId, milestoneId }).onConflictDoNothing();
    else await tx.delete(s.teamMilestones).where(and(eq(s.teamMilestones.teamId, teamId), eq(s.teamMilestones.milestoneId, milestoneId)));
  });
}

const ExtensionInput = z.object({
  newDate: z.iso.date(),
  reason: z.string().trim().min(1, "Say why the team needs more time").max(1000),
});

/** A team asks for more time on a milestone (again, if an earlier request was decided). The database checks the date. */
export async function requestExtension(teamId: string, milestoneId: string, input: z.input<typeof ExtensionInput>) {
  Id.parse(teamId);
  Id.parse(milestoneId);
  const x = ExtensionInput.parse(input);
  await withUser((tx) => tx.insert(s.deadlineExtensions).values({ teamId, milestoneId, ...x })
    .onConflictDoUpdate({ target: [s.deadlineExtensions.teamId, s.deadlineExtensions.milestoneId], set: x }));
}

/** The instructor approves or declines a pending request. */
export async function decideExtension(teamId: string, milestoneId: string, approve: boolean) {
  Id.parse(teamId);
  Id.parse(milestoneId);
  const updated = await withUser((tx) => tx.update(s.deadlineExtensions).set({ status: approve ? "approved" : "declined" })
    .where(and(eq(s.deadlineExtensions.teamId, teamId), eq(s.deadlineExtensions.milestoneId, milestoneId)))
    .returning({ status: s.deadlineExtensions.status }));
  if (!updated.length) throw new Error("Request not found");
}

// ─── Grading (rubric per course; team marks; per-student contribution factor) ─

type Tx = Parameters<Parameters<typeof withUser>[0]>[0];

/** The course, if the signed-in user is its instructor or one of its TAs (grading); throws otherwise. */
async function staffCourse(tx: Tx, uid: string, courseId: string) {
  const [course] = await tx.select().from(s.courses).where(and(eq(s.courses.id, courseId),
    or(eq(s.courses.instructorId, uid), sql`exists (select 1 from public.course_tas a where a.course_id = ${s.courses.id} and a.user_id = ${uid})`)));
  if (!course) throw new Error("Only the course's instructor and TAs can do this");
  return course;
}

/** The course, if the signed-in user is its instructor; throws otherwise. */
async function ownCourse(tx: Tx, uid: string, courseId: string) {
  const [course] = await tx.select().from(s.courses).where(and(eq(s.courses.id, courseId), eq(s.courses.instructorId, uid)));
  if (!course) throw new Error("Only the course instructor can do this");
  return course;
}

const loadCriteria = (tx: Tx, courseId: string) =>
  tx.select({ id: s.rubricCriteria.id, name: s.rubricCriteria.name, maxPoints: s.rubricCriteria.maxPoints }).from(s.rubricCriteria)
    .where(eq(s.rubricCriteria.courseId, courseId)).orderBy(asc(s.rubricCriteria.position), asc(s.rubricCriteria.createdAt));

/** Each member's peer average and review count, plus the factor suggested from them (instructor only: RLS). */
async function peerFactors(tx: Tx, teamIds: string[]) {
  if (!teamIds.length) return [];
  const [members, reviews] = await Promise.all([
    tx.select({ teamId: s.teamMembers.teamId, userId: s.users.id, name: s.users.name }).from(s.teamMembers)
      .innerJoin(s.users, eq(s.users.id, s.teamMembers.userId)).where(inArray(s.teamMembers.teamId, teamIds)).orderBy(asc(s.users.name)),
    tx.select({ teamId: s.peerReviews.teamId, userId: s.peerReviews.revieweeId, avg: sql<number>`avg(${s.peerReviews.rating})::float`, n: count() })
      .from(s.peerReviews).where(inArray(s.peerReviews.teamId, teamIds)).groupBy(s.peerReviews.teamId, s.peerReviews.revieweeId),
  ]);
  return members.map((m) => {
    const mine = reviews.find((r) => r.teamId === m.teamId && r.userId === m.userId);
    const teamAvgs = members.filter((x) => x.teamId === m.teamId)
      .map((x) => reviews.find((r) => r.teamId === m.teamId && r.userId === x.userId)?.avg ?? null);
    const peerAvg = mine ? Math.round(mine.avg * 100) / 100 : null;
    return { ...m, peerAvg, reviews: mine?.n ?? 0, suggestedFactor: suggestedFactor(peerAvg, teamAvgs) };
  });
}

export async function getCourseGrading(courseId: string): Promise<CourseGrading> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    const course = await staffCourse(tx, uid, courseId);
    const teams = await tx.select({ id: s.teams.id, name: s.teams.name }).from(s.teams).where(eq(s.teams.courseId, courseId)).orderBy(asc(s.teams.name));
    const ids = teams.map((t) => t.id);
    const [criteria, grades, factors, members] = await Promise.all([
      loadCriteria(tx, courseId),
      ids.length ? tx.select().from(s.teamGrades).where(inArray(s.teamGrades.teamId, ids)) : [],
      ids.length ? tx.select().from(s.studentGradeFactors).where(inArray(s.studentGradeFactors.teamId, ids)) : [],
      peerFactors(tx, ids),
    ]);
    return {
      released: course.gradesReleased,
      owner: course.instructorId === uid,
      criteria,
      teams: teams.map((t) => ({
        teamId: t.id,
        teamName: t.name,
        scores: Object.fromEntries(grades.filter((g) => g.teamId === t.id).map((g) => [g.criterionId, { points: g.points, feedback: g.feedback }])),
        members: members.filter((m) => m.teamId === t.id).map((m) => {
          const saved = factors.find((f) => f.teamId === t.id && f.userId === m.userId);
          return { userId: m.userId, name: m.name, peerAvg: m.peerAvg, reviews: m.reviews, suggestedFactor: m.suggestedFactor, override: saved?.overridden ? saved.factor : null };
        }),
      })),
    };
  });
}

const RubricInput = z.array(z.object({
  id: Id.optional(),
  name: z.string().trim().min(1, "Every criterion needs a name").max(80),
  maxPoints: z.number().int().min(1).max(1000),
})).max(20);

/** Replaces the course rubric: updates kept criteria, adds new ones, deletes removed ones (and their marks). */
export async function saveRubric(courseId: string, input: z.input<typeof RubricInput>) {
  Id.parse(courseId);
  const criteria = RubricInput.parse(input);
  await withUser(async (tx, uid) => {
    await ownCourse(tx, uid, courseId);
    const keep = criteria.flatMap((c) => (c.id ? [c.id] : []));
    await tx.delete(s.rubricCriteria).where(and(eq(s.rubricCriteria.courseId, courseId), keep.length ? notInArray(s.rubricCriteria.id, keep) : undefined));
    for (const [position, c] of criteria.entries()) {
      if (c.id) await tx.update(s.rubricCriteria).set({ name: c.name, maxPoints: c.maxPoints, position }).where(and(eq(s.rubricCriteria.id, c.id), eq(s.rubricCriteria.courseId, courseId)));
      else await tx.insert(s.rubricCriteria).values({ courseId, name: c.name, maxPoints: c.maxPoints, position });
    }
  });
}

const TeamGradeInput = z.object({
  scores: z.array(z.object({ criterionId: Id, points: z.number().min(0).max(1000), feedback: z.string().max(2000) })).max(20),
  overrides: z.array(z.object({ userId: Id, factor: z.number().min(0.5).max(1.5).nullable() })).max(50),
});

/** Saves a team's marks and stores every member's factor (their override, else the current suggestion). */
export async function saveTeamGrade(teamId: string, input: z.input<typeof TeamGradeInput>) {
  Id.parse(teamId);
  const g = TeamGradeInput.parse(input);
  await withUser(async (tx, uid) => {
    const [team] = await tx.select({ courseId: s.teams.courseId }).from(s.teams).where(eq(s.teams.id, teamId));
    if (!team) throw new Error("Team not found");
    await staffCourse(tx, uid, team.courseId);
    for (const sc of g.scores) {
      // The database trigger rejects points above the criterion's maximum or criteria from another course.
      await tx.insert(s.teamGrades).values({ teamId, criterionId: sc.criterionId, points: sc.points, feedback: sc.feedback })
        .onConflictDoUpdate({ target: [s.teamGrades.teamId, s.teamGrades.criterionId], set: { points: sc.points, feedback: sc.feedback } });
    }
    for (const m of await peerFactors(tx, [teamId])) {
      const override = g.overrides.find((o) => o.userId === m.userId)?.factor ?? null;
      const row = { factor: override ?? m.suggestedFactor, overridden: override != null };
      await tx.insert(s.studentGradeFactors).values({ teamId, userId: m.userId, ...row })
        .onConflictDoUpdate({ target: [s.studentGradeFactors.teamId, s.studentGradeFactors.userId], set: row });
    }
  });
}

export async function setGradesReleased(courseId: string, released: boolean) {
  Id.parse(courseId);
  await withUser(async (tx, uid) => {
    await ownCourse(tx, uid, courseId);
    await tx.update(s.courses).set({ gradesReleased: released }).where(eq(s.courses.id, courseId));
  });
}

/** The signed-in student's released grade for a course, or null (no team, not graded, or not released yet). */
export async function getMyGrade(courseId: string): Promise<MyGrade | null> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    const [team] = await tx.select({ id: s.teams.id, name: s.teams.name }).from(s.teams)
      .innerJoin(s.teamMembers, eq(s.teamMembers.teamId, s.teams.id))
      .where(and(eq(s.teams.courseId, courseId), eq(s.teamMembers.userId, uid)));
    if (!team) return null;
    // RLS returns marks and the factor only once the instructor has released grades.
    const [criteria, grades, [factor]] = await Promise.all([
      loadCriteria(tx, courseId),
      tx.select().from(s.teamGrades).where(eq(s.teamGrades.teamId, team.id)),
      tx.select().from(s.studentGradeFactors).where(and(eq(s.studentGradeFactors.teamId, team.id), eq(s.studentGradeFactors.userId, uid))),
    ]);
    if (!grades.length) return null;
    const scores: Record<string, CriterionScore> = Object.fromEntries(grades.map((g) => [g.criterionId, { points: g.points, feedback: g.feedback }]));
    return { teamName: team.name, criteria, scores, factor: factor?.factor ?? 1 };
  });
}

// ─── Contribution report (course instructor only) ──────────────────────

/** One row per enrolled student: team, task share, peer reviews, chat activity and team milestones, as CSV. */
export async function exportCourseReport(courseId: string): Promise<{ filename: string; csv: string }> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    const [course] = await tx.select().from(s.courses).where(and(eq(s.courses.id, courseId), eq(s.courses.instructorId, uid)));
    if (!course) throw new Error("Only the course instructor can export this report");

    const teams = await tx.select({ id: s.teams.id, name: s.teams.name }).from(s.teams).where(eq(s.teams.courseId, courseId));
    const teamIds = teams.map((t) => t.id);
    const none = teamIds.length === 0;
    const [students, members, contrib, progress, reviews, msgs, milestoneTotal, milestonesDone, criteria, grades, factors] = await Promise.all([
      tx.select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.courseEnrollments)
        .innerJoin(s.users, eq(s.users.id, s.courseEnrollments.userId)).where(eq(s.courseEnrollments.courseId, courseId)),
      none ? [] : tx.select().from(s.teamMembers).where(inArray(s.teamMembers.teamId, teamIds)),
      none ? [] : tx.select().from(s.memberContribution).where(inArray(s.memberContribution.teamId, teamIds)),
      none ? [] : tx.select().from(s.teamProgress).where(inArray(s.teamProgress.teamId, teamIds)),
      none ? [] : tx.select({ teamId: s.peerReviews.teamId, userId: s.peerReviews.revieweeId, avg: sql<number>`round(avg(${s.peerReviews.rating}), 2)::float`, n: count() })
        .from(s.peerReviews).where(inArray(s.peerReviews.teamId, teamIds)).groupBy(s.peerReviews.teamId, s.peerReviews.revieweeId),
      none ? [] : tx.select({ teamId: s.messages.teamId, userId: s.messages.senderId, n: count() })
        .from(s.messages).where(inArray(s.messages.teamId, teamIds)).groupBy(s.messages.teamId, s.messages.senderId),
      tx.select({ n: count() }).from(s.courseMilestones).where(eq(s.courseMilestones.courseId, courseId)),
      none ? [] : tx.select({ teamId: s.teamMilestones.teamId, n: count() }).from(s.teamMilestones)
        .where(inArray(s.teamMilestones.teamId, teamIds)).groupBy(s.teamMilestones.teamId),
      loadCriteria(tx, courseId),
      none ? [] : tx.select().from(s.teamGrades).where(inArray(s.teamGrades.teamId, teamIds)),
      none ? [] : tx.select().from(s.studentGradeFactors).where(inArray(s.studentGradeFactors.teamId, teamIds)),
    ]);
    const teamGrade = (teamId: string) =>
      teamPercent(criteria, Object.fromEntries(grades.filter((g) => g.teamId === teamId).map((g) => [g.criterionId, g.points])));

    const totalMs = milestoneTotal[0]?.n ?? 0;
    const rows = students.map((st) => {
      const team = teams.find((t) => members.some((m) => m.teamId === t.id && m.userId === st.id));
      if (!team) return { sort: `~${st.name}`, cells: [st.name, st.email, "No team", "", "", "", "", "", "", "", "", ""] };
      const c = contrib.find((x) => x.teamId === team.id && x.userId === st.id);
      const teamDone = progress.find((x) => x.teamId === team.id)?.doneTasks ?? 0;
      const r = reviews.find((x) => x.teamId === team.id && x.userId === st.id);
      const sent = msgs.find((x) => x.teamId === team.id && x.userId === st.id)?.n ?? 0;
      const ms = milestonesDone.find((x) => x.teamId === team.id)?.n ?? 0;
      const tg = teamGrade(team.id);
      const factor = factors.find((f) => f.teamId === team.id && f.userId === st.id)?.factor ?? 1;
      return {
        sort: `${team.name}\u0000${st.name}`,
        cells: [
          st.name, st.email, team.name, c?.tasksDone ?? 0, c?.tasksAssigned ?? 0,
          teamDone ? Math.round(((c?.tasksDone ?? 0) / teamDone) * 100) : 0,
          r ? r.avg : "", r?.n ?? 0, sent, totalMs ? `${ms}/${totalMs}` : "",
          tg ?? "", finalPercent(tg, factor) ?? "",
        ],
      };
    }).sort((a, b) => a.sort.localeCompare(b.sort));

    const header = ["Student", "Email", "Team", "Tasks done", "Tasks assigned", "Share of team's done tasks (%)",
      "Avg peer rating (1-5)", "Peer reviews received", "Messages sent", "Team milestones done", "Team grade (%)", "Final grade (%)"];
    const date = new Date().toISOString().slice(0, 10);
    return { filename: `${course.code}-contribution-report-${date}.csv`, csv: toCsv([header, ...rows.map((r) => r.cells)]) };
  });
}

/**
 * The gradebook for an LMS import (Moodle, Canvas, …): one row per enrolled student, keyed by email, with each rubric
 * criterion's points, the team grade, the student's contribution factor and the final grade. Blank = not graded.
 */
export async function exportGradebook(courseId: string): Promise<{ filename: string; csv: string }> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    const course = await staffCourse(tx, uid, courseId);
    const teams = await tx.select({ id: s.teams.id, name: s.teams.name }).from(s.teams).where(eq(s.teams.courseId, courseId));
    const ids = teams.map((t) => t.id);
    const none = !ids.length;
    const [students, members, criteria, grades, factors] = await Promise.all([
      tx.select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.courseEnrollments)
        .innerJoin(s.users, eq(s.users.id, s.courseEnrollments.userId)).where(eq(s.courseEnrollments.courseId, courseId)),
      none ? [] : tx.select().from(s.teamMembers).where(inArray(s.teamMembers.teamId, ids)),
      loadCriteria(tx, courseId),
      none ? [] : tx.select().from(s.teamGrades).where(inArray(s.teamGrades.teamId, ids)),
      none ? [] : tx.select().from(s.studentGradeFactors).where(inArray(s.studentGradeFactors.teamId, ids)),
    ]);
    const rows = students.map((st) => {
      const team = teams.find((t) => members.some((m) => m.teamId === t.id && m.userId === st.id));
      const points = Object.fromEntries(grades.filter((g) => g.teamId === team?.id).map((g) => [g.criterionId, g.points]));
      const tg = team ? teamPercent(criteria, points) : null;
      const factor = factors.find((f) => f.teamId === team?.id && f.userId === st.id)?.factor ?? 1;
      return [st.name, st.email, team?.name ?? "", ...criteria.map((c) => points[c.id] ?? ""), tg ?? "", tg == null ? "" : factor, finalPercent(tg, factor) ?? ""];
    }).sort((a, b) => `${a[2] || "~"}\u0000${a[0]}`.localeCompare(`${b[2] || "~"}\u0000${b[0]}`));

    const header = ["Student", "Email", "Team", ...criteria.map((c) => `${c.name} (/${c.maxPoints})`), "Team grade (%)", "Contribution factor", "Final grade (%)"];
    return { filename: `${course.code}-gradebook-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv([header, ...rows]) };
  });
}

// ─── Office hours (the instructor publishes slots; a team books one) ────

/** Upcoming slots (and ones in progress) for a course, plus whether I can book (a team in the course). */
export async function getOfficeHours(courseId: string): Promise<{ slots: OfficeHourSlot[]; myTeamId: string | null }> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    const [course] = await tx.select({ instructorId: s.courses.instructorId }).from(s.courses).where(eq(s.courses.id, courseId));
    const instructor = course?.instructorId === uid;
    const [rows, [mine]] = await Promise.all([
      tx.select({ o: s.officeHours, teamName: s.teams.name, bookedByName: s.users.name }).from(s.officeHours) // RLS: instructor or enrolled
        .leftJoin(s.teams, eq(s.teams.id, s.officeHours.teamId)).leftJoin(s.users, eq(s.users.id, s.officeHours.bookedBy))
        .where(and(eq(s.officeHours.courseId, courseId), sql`${s.officeHours.startsAt} + make_interval(mins => ${s.officeHours.minutes}) > now()`))
        .orderBy(asc(s.officeHours.startsAt)).limit(200),
      tx.select({ id: s.teams.id }).from(s.teams).innerJoin(s.teamMembers, and(eq(s.teamMembers.teamId, s.teams.id), eq(s.teamMembers.userId, uid)))
        .where(eq(s.teams.courseId, courseId)),
    ]);
    return {
      myTeamId: mine?.id ?? null,
      slots: rows.map(({ o, teamName, bookedByName }) => {
        const own = !!o.teamId && o.teamId === mine?.id;
        const show = instructor || own;
        return { id: o.id, startsAt: o.startsAt, minutes: o.minutes, location: o.location, booked: !!o.teamId, mine: own,
          teamName: show ? teamName : null, topic: show ? o.topic : "", bookedByName: show ? bookedByName : null };
      }),
    };
  });
}

const OfficeHoursInput = z.object({
  starts: z.array(z.iso.datetime({ offset: true })).min(1).max(24),
  minutes: z.number().int().min(5).max(240),
  location: z.string().trim().max(300),
  tz: z.string().max(64).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
});

/** Adds slots (the browser works out the instants in the instructor's time zone). Course instructor only (RLS). */
export async function addOfficeHours(courseId: string, input: z.input<typeof OfficeHoursInput>) {
  Id.parse(courseId);
  const o = OfficeHoursInput.parse(input);
  if (o.starts.some((x) => new Date(x).getTime() <= Date.now())) throw new Error("Office hours must be in the future");
  await withUser(async (tx, uid) => {
    const course = await ownCourse(tx, uid, courseId);
    if (course.archivedAt) throw new Error("This course is archived");
    await tx.insert(s.officeHours).values(o.starts.map((startsAt) => ({ courseId, startsAt, minutes: o.minutes, location: o.location, tz: o.tz })));
  });
}

export async function deleteOfficeHour(id: string) {
  Id.parse(id);
  await withUser((tx) => tx.delete(s.officeHours).where(eq(s.officeHours.id, id))); // RLS: the course instructor
}

/** Why a booking or cancellation was refused, in words for the student; null when it worked. */
async function officeHourCall(run: (tx: Tx) => Promise<unknown>): Promise<string | null> {
  const L = await requestLocale();
  try {
    await withUser(run);
    return null;
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause ?? (err as { code?: string; message?: string });
    if (cause?.code === "P0001" || cause?.code === "P0002") return cause.message ?? translate(L, "Could not do that");
    throw err;
  }
}

export async function bookOfficeHour(id: string, topic: string) {
  Id.parse(id);
  const t = z.string().max(500).parse(topic);
  return officeHourCall((tx) => tx.execute(sql`select public.book_office_hour(${id}::uuid, ${t})`));
}

export async function cancelOfficeHour(id: string) {
  Id.parse(id);
  return officeHourCall((tx) => tx.execute(sql`select public.cancel_office_hour(${id}::uuid)`));
}

// ─── Team charter (members write and agree; the instructor reads) ──────

export async function getCharter(teamId: string): Promise<TeamCharter> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const [[row], members, agreed] = await Promise.all([
      tx.select({ c: s.teamCharters, updatedByName: s.users.name }).from(s.teamCharters)
        .leftJoin(s.users, eq(s.users.id, s.teamCharters.updatedBy)).where(eq(s.teamCharters.teamId, teamId)),
      tx.select({ userId: s.users.id, name: s.users.name }).from(s.teamMembers).innerJoin(s.users, eq(s.users.id, s.teamMembers.userId))
        .where(eq(s.teamMembers.teamId, teamId)).orderBy(asc(s.users.name)),
      tx.select().from(s.charterAgreements).where(eq(s.charterAgreements.teamId, teamId)),
    ]);
    const c = row?.c;
    return {
      charter: c ? { roles: c.roles, meetings: c.meetings, missedWork: c.missedWork, communication: c.communication, updatedAt: c.updatedAt, updatedByName: row.updatedByName } : null,
      members: members.map((m) => ({ ...m, agreedAt: agreed.find((a) => a.userId === m.userId)?.agreedAt ?? null })),
    };
  });
}

const CharterInput = z.object({
  roles: z.string().trim().max(2000),
  meetings: z.string().trim().max(2000),
  missedWork: z.string().trim().max(2000),
  communication: z.string().trim().max(2000),
}).refine((c) => Object.values(c).some(Boolean), "Write at least one part of the charter");

/** Writes or edits the charter (members only: RLS). The database records me as agreeing and asks the others again. */
export async function saveCharter(teamId: string, input: CharterText) {
  Id.parse(teamId);
  const c = CharterInput.parse(input);
  await withUser((tx) => tx.insert(s.teamCharters).values({ teamId, ...c })
    .onConflictDoUpdate({ target: s.teamCharters.teamId, set: c }));
}

export async function agreeToCharter(teamId: string) {
  Id.parse(teamId);
  await withUser((tx, uid) => tx.insert(s.charterAgreements).values({ teamId, userId: uid }).onConflictDoNothing());
}

// ─── GitHub (a repo per team; see src/lib/github.ts) ─────────────────────

/** Commits per GitHub username (lowercased) in a team's repo. */
async function repoCommits(tx: Tx, teamId: string) {
  const rows = await tx.select({ login: sql<string>`lower(${s.repoActivity.githubLogin})`, n: count() }).from(s.repoActivity)
    .where(and(eq(s.repoActivity.teamId, teamId), eq(s.repoActivity.kind, "commit"), isNotNull(s.repoActivity.githubLogin))).groupBy(sql`1`);
  return new Map(rows.map((r) => [r.login, r.n]));
}

/** A team's repo, sync status and latest 60 commits and pull requests, matched to members by GitHub username. */
export async function getRepoFeed(teamId: string): Promise<RepoFeed> {
  Id.parse(teamId);
  return withUser(async (tx) => {
    const [team] = await tx.select({ repo: s.teams.repo, syncedAt: s.teams.repoSyncedAt, error: s.teams.repoError }).from(s.teams).where(eq(s.teams.id, teamId));
    if (!team) throw new Error("Team not found");
    const [members, activity, commits] = await Promise.all([
      tx.select({ userId: s.users.id, name: s.users.name, githubLogin: s.users.githubLogin }).from(s.teamMembers)
        .innerJoin(s.users, eq(s.users.id, s.teamMembers.userId)).where(eq(s.teamMembers.teamId, teamId)).orderBy(asc(s.users.name)),
      tx.select().from(s.repoActivity).where(eq(s.repoActivity.teamId, teamId)).orderBy(desc(s.repoActivity.at)).limit(60),
      repoCommits(tx, teamId),
    ]);
    const byLogin = new Map(members.filter((m) => m.githubLogin).map((m) => [m.githubLogin!.toLowerCase(), m]));
    return {
      ...team,
      members: members.map((m) => ({ ...m, commits: (m.githubLogin && commits.get(m.githubLogin.toLowerCase())) || 0 })),
      activity: activity.map((a) => {
        const m = a.githubLogin ? byLogin.get(a.githubLogin.toLowerCase()) : undefined;
        return { id: a.id, kind: a.kind, title: a.title, url: a.url, state: a.state, at: a.at, userId: m?.userId ?? null, author: m?.name ?? (a.githubLogin ? `@${a.githubLogin}` : a.authorName) };
      }),
    };
  });
}

/** Team members and the course instructor may change the repo, while the course is active. */
async function assertRepoEditor(teamId: string) {
  return withUser(async (tx, uid) => {
    const [t] = await tx.select({ instructorId: s.courses.instructorId, archivedAt: s.courses.archivedAt, member: sql<boolean>`public.is_team_member(${s.teams.id})` })
      .from(s.teams).innerJoin(s.courses, eq(s.courses.id, s.teams.courseId)).where(eq(s.teams.id, teamId));
    if (!t || (!t.member && t.instructorId !== uid)) throw new Error("Only the team and its instructor can change the repo");
    if (t.archivedAt) throw new Error("This course is archived");
  });
}

/**
 * Links a GitHub repo to a team (or unlinks it with null), after checking GitHub can read it. Returns an error message
 * for the person, or null. Changing the repo clears the old one's activity; the first sync starts right away.
 */
export async function setTeamRepo(teamId: string, input: string | null): Promise<string | null> {
  Id.parse(teamId);
  const wanted = input === null ? null : parseRepo(z.string().max(300).parse(input));
  if (input !== null && !wanted) return "Use owner/name, or paste the repository's GitHub link.";
  await assertRepoEditor(teamId);
  let repo: string | null = null;
  if (wanted) {
    try {
      repo = await checkRepo(wanted);
    } catch (err) {
      if (err instanceof RepoError) return err.message;
      throw err;
    }
  }
  // The owner role writes: teams are otherwise instructor-only, and the repo is all this changes.
  await adminDb.transaction(async (db) => {
    await db.update(s.teams).set({ repo, repoSyncedAt: null, repoError: null }).where(eq(s.teams.id, teamId));
    await db.delete(s.repoActivity).where(eq(s.repoActivity.teamId, teamId));
  });
  if (repo) {
    try {
      await inngest.send({ name: "github/repo.linked", data: { teamId } });
    } catch (err) {
      console.error("Queueing the first repo sync failed:", err); // the half-hourly sync picks it up
    }
  }
  return null;
}

const REPO_SYNC_COOLDOWN_MS = 60 * 1000;

/** Reads the repo now instead of waiting for the half-hourly sync. "cooldown" = it was read in the last minute. */
export async function syncRepoNow(teamId: string): Promise<"ok" | "cooldown" | "none"> {
  Id.parse(teamId);
  await assertRepoEditor(teamId);
  const [team] = await adminDb.select({ repo: s.teams.repo, syncedAt: s.teams.repoSyncedAt }).from(s.teams).where(eq(s.teams.id, teamId));
  if (!team?.repo) return "none";
  if (team.syncedAt && Date.now() - new Date(team.syncedAt).getTime() < REPO_SYNC_COOLDOWN_MS) return "cooldown";
  await syncTeamRepo(teamId);
  return "ok";
}

// ─── Course trends (analytics over time; course instructor only) ───────

const TREND_WEEKS = 10;

/**
 * For each team, per week over the last 10: tasks finished, messages, the health score at the end of the week and
 * board completion at the end of the week (each task's status then, rebuilt from task history).
 */
export async function getCourseTrends(courseId: string): Promise<CourseTrends> {
  Id.parse(courseId);
  return withUser(async (tx, uid) => {
    await ownCourse(tx, uid, courseId);
    const rows = await tx.execute<{ team_id: string; name: string; week: string; done: number; messages: number; health: number | null; total: number; done_total: number }>(sql`
      with weeks as (
        select wk, wk + interval '1 week' as wk_end
        from generate_series(date_trunc('week', now()) - make_interval(weeks => ${TREND_WEEKS - 1}), date_trunc('week', now()), interval '1 week') as wk
      )
      select t.id as team_id, t.name, to_char(w.wk, 'YYYY-MM-DD') as week,
        (select count(distinct e.task_id) from public.task_events e join public.tasks k on k.id = e.task_id
          where k.team_id = t.id and e.field = 'status' and e.new_value = 'done' and e.created_at >= w.wk and e.created_at < w.wk_end)::int as done,
        (select count(*) from public.messages m where m.team_id = t.id and m.created_at >= w.wk and m.created_at < w.wk_end)::int as messages,
        (select h.score from public.team_health_history h where h.team_id = t.id and h.day < w.wk_end::date order by h.day desc limit 1)::int as health,
        (select count(*) from public.tasks k where k.team_id = t.id and k.created_at < w.wk_end)::int as total,
        (select count(*) from public.tasks k where k.team_id = t.id and k.created_at < w.wk_end and coalesce(
          (select e.new_value from public.task_events e where e.task_id = k.id and e.field = 'status' and e.created_at < w.wk_end order by e.created_at desc, e.id desc limit 1),
          (select e.old_value from public.task_events e where e.task_id = k.id and e.field = 'status' order by e.created_at, e.id limit 1),
          k.status::text) = 'done')::int as done_total
      from public.teams t cross join weeks w
      where t.course_id = ${courseId}
      order by t.name, w.wk`);
    const weeks = [...new Set(rows.map((r) => r.week))];
    const teams = new Map<string, CourseTrends["teams"][number]>();
    for (const r of rows) {
      const t = teams.get(r.team_id) ?? { id: r.team_id, name: r.name, done: [], messages: [], health: [], progress: [] };
      t.done.push(r.done);
      t.messages.push(r.messages);
      t.health.push(r.health);
      t.progress.push(r.total ? Math.round((r.done_total / r.total) * 100) : null);
      teams.set(r.team_id, t);
    }
    return { weeks, teams: [...teams.values()] };
  });
}

// ─── Contribution report (one student; the student themself or the course instructor) ─

/** One student's tasks, chat, files, stand-ups and (for the instructor) peer reviews in a course, next to their team's. */
export async function getContribution(courseId: string, userId: string): Promise<Contribution> {
  Id.parse(courseId);
  Id.parse(userId);
  return withUser(async (tx, uid) => {
    const [course] = await tx.select({ id: s.courses.id, code: s.courses.code, title: s.courses.title, instructorId: s.courses.instructorId })
      .from(s.courses).where(eq(s.courses.id, courseId));
    const instructor = !!course && (course.instructorId === uid
      || (await tx.select({ id: s.courseTas.userId }).from(s.courseTas).where(and(eq(s.courseTas.courseId, courseId), eq(s.courseTas.userId, uid)))).length > 0);
    if (!course || (uid !== userId && !instructor)) throw new Error("Only the student and their instructor can see this report");
    const [student] = await tx.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
    if (!student) throw new Error("Student not found");
    const [team] = await tx.select({ id: s.teams.id, name: s.teams.name, repo: s.teams.repo, joinedAt: s.teamMembers.joinedAt }).from(s.teams)
      .innerJoin(s.teamMembers, and(eq(s.teamMembers.teamId, s.teams.id), eq(s.teamMembers.userId, userId)))
      .where(eq(s.teams.courseId, courseId));
    const [helped] = await tx.select({ answers: count(), solved: sql<number>`count(*) filter (where ${s.helpQuestions.solvedBy} = ${s.helpAnswers.id})::int` })
      .from(s.helpAnswers).innerJoin(s.helpQuestions, eq(s.helpQuestions.id, s.helpAnswers.questionId))
      .where(and(eq(s.helpQuestions.courseId, courseId), eq(s.helpAnswers.authorId, userId)));
    const [focus] = await tx.select({ minutes: sql<number>`coalesce(sum(${s.focusSessions.minutes}), 0)::int` }).from(s.focusSessions)
      .innerJoin(s.teams, eq(s.teams.id, s.focusSessions.teamId)).where(and(eq(s.teams.courseId, courseId), eq(s.focusSessions.userId, userId)));
    const base = { course: { id: course.id, code: course.code, title: course.title }, student,
      helped: { answers: helped?.answers ?? 0, solved: helped?.solved ?? 0 }, focusMinutes: focus?.minutes ?? 0 };
    if (!team) return { ...base, team: null };

    const since = sql`date_trunc('week', now()) - interval '7 weeks'`;
    const week = (col: unknown) => sql<string>`to_char(date_trunc('week', ${col}), 'YYYY-MM-DD')`;
    // Qualified by hand: Drizzle leaves columns unqualified in a one-table select, and "id" would mean task_events.id.
    const doneAt = sql<string | null>`(select max(e.created_at) from public.task_events e where e.task_id = "tasks"."id" and e.field = 'status' and e.new_value = 'done')`;
    const [members, contrib, msgs, files, standups, standupWeeks, tasks, msgWeeks, taskWeeks, reviews, risk, commits] = await Promise.all([
      tx.select({ userId: s.users.id, name: s.users.name, githubLogin: s.users.githubLogin }).from(s.teamMembers).innerJoin(s.users, eq(s.users.id, s.teamMembers.userId))
        .where(eq(s.teamMembers.teamId, team.id)).orderBy(asc(s.users.name)),
      tx.select().from(s.memberContribution).where(eq(s.memberContribution.teamId, team.id)),
      tx.select({ userId: s.messages.senderId, n: count() }).from(s.messages).where(eq(s.messages.teamId, team.id)).groupBy(s.messages.senderId),
      tx.select({ userId: s.files.uploaderId, n: count() }).from(s.files).where(eq(s.files.teamId, team.id)).groupBy(s.files.uploaderId),
      tx.select({ userId: s.standups.userId, n: count() }).from(s.standups).where(eq(s.standups.teamId, team.id)).groupBy(s.standups.userId),
      tx.select({ n: sql<number>`count(distinct ${s.standups.weekStart})::int` }).from(s.standups).where(eq(s.standups.teamId, team.id)),
      tx.select({ id: s.tasks.id, title: s.tasks.title, status: s.tasks.status, dueDate: s.tasks.dueDate, doneAt }).from(s.tasks)
        .where(and(eq(s.tasks.teamId, team.id), eq(s.tasks.assigneeId, userId))).orderBy(desc(s.tasks.updatedAt)).limit(50),
      tx.select({ week: week(s.messages.createdAt), n: count() }).from(s.messages)
        .where(and(eq(s.messages.teamId, team.id), eq(s.messages.senderId, userId), sql`${s.messages.createdAt} >= ${since}`)).groupBy(sql`1`),
      tx.select({ week: week(s.taskEvents.createdAt), n: sql<number>`count(distinct ${s.taskEvents.taskId})::int` }).from(s.taskEvents)
        .innerJoin(s.tasks, eq(s.tasks.id, s.taskEvents.taskId))
        .where(and(eq(s.tasks.teamId, team.id), eq(s.tasks.assigneeId, userId), eq(s.taskEvents.field, "status"), eq(s.taskEvents.newValue, "done"), sql`${s.taskEvents.createdAt} >= ${since}`))
        .groupBy(sql`1`),
      // RLS: a student only reads reviews they wrote, so this is the instructor's view.
      instructor ? tx.select({ rating: s.peerReviews.rating, categories: s.peerReviews.categoryRatings, feedback: s.peerReviews.feedback, at: s.peerReviews.createdAt })
        .from(s.peerReviews).where(and(eq(s.peerReviews.teamId, team.id), eq(s.peerReviews.revieweeId, userId))).orderBy(desc(s.peerReviews.createdAt)) : [],
      instructor ? tx.select({ reasons: s.fallingBehind.reasons }).from(s.fallingBehind)
        .where(and(eq(s.fallingBehind.teamId, team.id), eq(s.fallingBehind.userId, userId), isNull(s.fallingBehind.resolvedAt))) : [],
      repoCommits(tx, team.id),
    ]);

    const n = (rows: { userId: string | null; n: number }[], id: string) => rows.find((r) => r.userId === id)?.n ?? 0;
    const monday = new Date(`${currentWeekStart()}T00:00:00Z`);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const w = new Date(monday.getTime() - (7 - i) * 7 * 86_400_000).toISOString().slice(0, 10);
      return { week: w, tasks: taskWeeks.find((r) => r.week === w)?.n ?? 0, messages: msgWeeks.find((r) => r.week === w)?.n ?? 0 };
    });
    const categories: Record<string, number[]> = {};
    for (const r of reviews) for (const [k, v] of Object.entries(r.categories ?? {})) (categories[k] ??= []).push(v);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

    return {
      ...base,
      team: {
        id: team.id, name: team.name, repo: team.repo, joinedAt: team.joinedAt,
        members: members.map((m) => {
          const c = contrib.find((x) => x.userId === m.userId);
          return {
            ...m, tasksDone: c?.tasksDone ?? 0, tasksAssigned: c?.tasksAssigned ?? 0, messages: n(msgs, m.userId), files: n(files, m.userId),
            standups: n(standups, m.userId), commits: (m.githubLogin && commits.get(m.githubLogin.toLowerCase())) || 0,
          };
        }),
        standupWeeks: standupWeeks[0]?.n ?? 0,
        tasks: tasks.map((k) => ({ ...k, status: toUiStatus(k.status) })),
        weeks,
        peer: instructor ? {
          avg: avg(reviews.map((r) => r.rating)), n: reviews.length,
          categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, avg(v)!])),
          feedback: reviews.filter((r) => r.feedback.trim()).map((r) => ({ text: r.feedback, at: r.at })),
        } : null,
        atRisk: instructor ? (risk[0]?.reasons ?? null) : null,
      },
    };
  });
}

// ─── My week (students): everything dated across all their teams ───────

const WEEK_AHEAD_DAYS = 120; // the list shows three weeks; the month view and calendar export look further

/** Unfinished tasks assigned to me and my teams' open milestones: overdue, or due in the next four months. */
export async function getMyWeek(): Promise<WeekItem[]> {
  const L = await requestLocale();
  return withUser(async (tx, uid) => {
    const horizon = new Date(Date.now() + WEEK_AHEAD_DAYS * 864e5).toISOString().slice(0, 10);
    const myTeams = await tx.select({ id: s.teams.id, name: s.teams.name, courseId: s.teams.courseId, courseCode: s.courses.code })
      .from(s.teams)
      .innerJoin(s.teamMembers, and(eq(s.teamMembers.teamId, s.teams.id), eq(s.teamMembers.userId, uid)))
      .innerJoin(s.courses, eq(s.courses.id, s.teams.courseId));
    if (!myTeams.length) return [];
    const teamOf = (id: string) => myTeams.find((t) => t.id === id)!;

    const [tasks, milestones, done, office, extended] = await Promise.all([
      tx.select().from(s.tasks).where(and(
        eq(s.tasks.assigneeId, uid), ne(s.tasks.status, "done"), isNotNull(s.tasks.dueDate), lte(s.tasks.dueDate, horizon),
        inArray(s.tasks.teamId, myTeams.map((t) => t.id)),
      )),
      tx.select().from(s.courseMilestones).where(and(
        inArray(s.courseMilestones.courseId, myTeams.map((t) => t.courseId)), lte(s.courseMilestones.dueDate, horizon),
      )),
      tx.select().from(s.teamMilestones).where(inArray(s.teamMilestones.teamId, myTeams.map((t) => t.id))),
      tx.select({ o: s.officeHours, day: sql<string>`to_char(${s.officeHours.startsAt} at time zone ${s.officeHours.tz}, 'YYYY-MM-DD')` })
        .from(s.officeHours).where(and(
          inArray(s.officeHours.teamId, myTeams.map((t) => t.id)), lte(s.officeHours.startsAt, sql`${horizon}::date + 1`),
          sql`${s.officeHours.startsAt} + make_interval(mins => ${s.officeHours.minutes}) > now()`,
        )),
      tx.select({ teamId: s.deadlineExtensions.teamId, milestoneId: s.deadlineExtensions.milestoneId, date: s.deadlineExtensions.approvedDate })
        .from(s.deadlineExtensions).where(and(inArray(s.deadlineExtensions.teamId, myTeams.map((t) => t.id)), isNotNull(s.deadlineExtensions.approvedDate))),
    ]);

    const items: WeekItem[] = tasks.map((k) => {
      const t = teamOf(k.teamId);
      return { kind: "task", id: k.id, title: k.title, date: k.dueDate!, teamId: t.id, teamName: t.name, courseId: t.courseId, courseCode: t.courseCode, priority: k.priority, status: toUiStatus(k.status) };
    });
    for (const m of milestones) {
      for (const t of myTeams.filter((x) => x.courseId === m.courseId)) {
        if (done.some((d) => d.teamId === t.id && d.milestoneId === m.id)) continue;
        const date = extended.find((x) => x.teamId === t.id && x.milestoneId === m.id)?.date ?? m.dueDate; // an approved extension
        if (date > horizon) continue;
        items.push({ kind: "milestone", id: m.id, title: m.title, date, teamId: t.id, teamName: t.name, courseId: t.courseId, courseCode: t.courseCode });
      }
    }
    for (const { o, day } of office) {
      const t = teamOf(o.teamId!);
      items.push({ kind: "office-hours", id: o.id, title: o.topic ? translate(L, "Office hours: {topic}", { topic: o.topic }) : translate(L, "Office hours"), date: day, teamId: t.id, teamName: t.name,
        courseId: t.courseId, courseCode: t.courseCode, startsAt: o.startsAt, minutes: o.minutes, location: o.location });
    }
    const order = { milestone: 0, "office-hours": 1, task: 2 } as const;
    return items.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  });
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function getNotifications(): Promise<Notification[]> {
  return withUser(async (tx, uid) => {
    const rows = await tx.select().from(s.notifications).where(eq(s.notifications.userId, uid))
      .orderBy(desc(s.notifications.createdAt)).limit(50);
    const l = await requestLocale();
    return rows.map((n) => ({ id: n.id, type: n.type, title: translateNotice(l, n.title), description: translateNotice(l, n.body), read: !!n.readAt, createdAt: n.createdAt, link: n.link }));
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
  const L = await requestLocale();
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
      uploadedBy: uploader ?? translate(L, "Former member"), uploaderId: f.uploaderId, createdAt: f.createdAt, storagePath: f.storagePath,
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

/**
 * Deletes a file: RLS lets the uploader or the course instructor remove the row, then the stored object goes.
 * Both happen in one transaction, so a storage failure keeps the row. Chat messages keep a "(deleted)" note.
 */
export async function deleteFile(fileId: string) {
  Id.parse(fileId);
  await withUser(async (tx) => {
    const [row] = await tx.delete(s.files).where(eq(s.files.id, fileId)).returning({ path: s.files.storagePath });
    if (!row) throw new Error("File not found, or you can't delete it");
    const sb = await supabaseServer();
    const { error } = await sb.storage.from("team-files").remove([row.path]);
    if (error) throw error;
  });
}

// ─── Study buddy ──────────────────────────────────────────────────────

export interface StudyAnswer { answer: string; cited: CitedSource[] }

const TEXT_FILE = /^(text\/|application\/(json|xml|x-yaml|javascript|typescript|sql))|\.(md|txt|csv|json|ya?ml|py|js|ts|tsx|jsx|java|c|cpp|h|cs|go|rs|rb|php|sql|html|css)$/i;
const MAX_READ = 200_000; // bytes; bigger files are listed by name only

/**
 * A question about a course, answered by the AI from that course's announcements and milestones and (for a student)
 * their team's files, with numbered sources. Everything is read as the user, so RLS decides what the AI sees.
 */
// shortcut: no per-user limit on AI calls (like the other AI actions); add one if costs or abuse show up.
export async function askStudyBuddy(courseId: string, question: string): Promise<StudyAnswer> {
  Id.parse(courseId);
  const q = z.string().trim().min(3).max(500).parse(question);
  const L = await requestLocale();
  const { sources, files, teamId } = await withUser(async (tx, uid) => {
    const [course] = await tx.select({ instructorId: s.courses.instructorId }).from(s.courses).where(eq(s.courses.id, courseId));
    if (!course) throw new Error("Course not found");
    const role = course.instructorId === uid ? "instructor" : "student";
    const page = `/${role}/courses/${courseId}`;
    const [ann, ms, team] = await Promise.all([
      tx.select().from(s.courseAnnouncements).where(eq(s.courseAnnouncements.courseId, courseId)).orderBy(desc(s.courseAnnouncements.createdAt)).limit(30),
      tx.select().from(s.courseMilestones).where(eq(s.courseMilestones.courseId, courseId)).orderBy(asc(s.courseMilestones.dueDate)),
      tx.select({ id: s.teams.id }).from(s.teams).innerJoin(s.teamMembers, and(eq(s.teamMembers.teamId, s.teams.id), eq(s.teamMembers.userId, uid)))
        .where(eq(s.teams.courseId, courseId)).limit(1),
    ]);
    const teamId = team[0]?.id ?? null;
    const files = teamId ? await tx.select().from(s.files).where(eq(s.files.teamId, teamId)).orderBy(desc(s.files.createdAt)).limit(20) : [];
    const sources: StudySource[] = [
      ...ann.map((a) => ({ kind: "announcement" as const, title: a.title, text: `Posted ${a.createdAt.slice(0, 10)}.\n${a.body}`, link: page })),
      ...ms.map((m) => ({ kind: "milestone" as const, title: m.title,
        text: `Due ${m.dueDate}.${m.requiresSubmission ? " Teams hand in work for it." : ""}\n${m.description}`, link: page })),
    ];
    return { sources, files, teamId };
  });
  // Small text files are read for their contents; the rest are listed by name so "which files do we have" still works.
  const bucket = (await supabaseServer()).storage.from("team-files");
  let read = 0;
  for (const f of files) {
    let text = `${f.name} (${f.mimeType}, ${Math.ceil(f.sizeBytes / 1024)} KB), shared ${f.createdAt.slice(0, 10)}. Its contents can't be read here.`;
    if (read < 8 && f.sizeBytes <= MAX_READ && (TEXT_FILE.test(f.mimeType) || TEXT_FILE.test(f.name))) {
      const { data } = await bucket.download(f.storagePath);
      if (data) { text = `${f.name}, shared ${f.createdAt.slice(0, 10)}:\n${await data.text()}`; read++; }
    }
    sources.push({ kind: "file", title: f.name, text, link: `/student?team=${teamId}&view=files` });
  }
  if (!sources.length) return { answer: translate(L, "This course has no announcements, milestones or files yet, so there's nothing to answer from."), cited: [] };
  const answer = await answerFromSources(q, sources, L);
  if (!answer) throw new Error("The AI returned nothing");
  return citeAnswer(answer, sources);
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

/** Reviews the signed-in student has written for teammates in this team (RLS: reviewers read their own). */
export async function getMyReviews(teamId: string): Promise<MyReview[]> {
  Id.parse(teamId);
  return withUser(async (tx, uid) => {
    const rows = await tx.select().from(s.peerReviews)
      .where(and(eq(s.peerReviews.teamId, teamId), eq(s.peerReviews.reviewerId, uid)));
    return rows.map((r) => ({ revieweeId: r.revieweeId, rating: r.rating, categoryRatings: r.categoryRatings, feedback: r.feedback, createdAt: r.createdAt }));
  });
}

/** Every review in a team, with fairness flags, for the instructor. Students get [] (they read only their own). */
export async function getTeamReviews(teamId: string): Promise<TeamReview[]> {
  Id.parse(teamId);
  const reviewer = alias(s.users, "reviewer");
  const reviewee = alias(s.users, "reviewee");
  return withUser(async (tx) => {
    const [{ teaches }] = await tx.execute<{ teaches: boolean }>(sql`select public.teaches_team(${teamId}) as teaches`);
    if (!teaches) return [];
    const rows = await tx.select({ r: s.peerReviews, reviewerName: reviewer.name, revieweeName: reviewee.name })
      .from(s.peerReviews)
      .innerJoin(reviewer, eq(reviewer.id, s.peerReviews.reviewerId))
      .innerJoin(reviewee, eq(reviewee.id, s.peerReviews.revieweeId))
      .where(eq(s.peerReviews.teamId, teamId))
      .orderBy(asc(reviewee.name), desc(s.peerReviews.rating));
    const flags = reviewFlags(rows.map(({ r }) => r));
    return rows.map(({ r, reviewerName, revieweeName }, i) => ({
      id: r.id, reviewerName, revieweeId: r.revieweeId, revieweeName, rating: r.rating, feedback: r.feedback, createdAt: r.createdAt, flags: flags[i],
    }));
  });
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

/** Open falling-behind cases in my courses, for the nav badge (RLS: instructors see their teams'). */
export async function countAtRisk(): Promise<number> {
  return withUser(async (tx) => {
    const [r] = await tx.select({ n: count() }).from(s.fallingBehind).where(isNull(s.fallingBehind.resolvedAt));
    return r?.n ?? 0;
  });
}

/** Students the falling-behind check flagged in my courses: open cases, and ones that recovered in the last 30 days. */
export async function getAtRisk(): Promise<AtRiskStudent[]> {
  return withUser(async (tx) => {
    const rows = await tx.select({ f: s.fallingBehind, teamName: s.teams.name, courseId: s.courses.id, courseCode: s.courses.code, name: s.users.name })
      .from(s.fallingBehind) // RLS: only the team's instructor
      .innerJoin(s.teams, eq(s.teams.id, s.fallingBehind.teamId))
      .innerJoin(s.courses, eq(s.courses.id, s.teams.courseId))
      .innerJoin(s.users, eq(s.users.id, s.fallingBehind.userId))
      .where(sql`${s.fallingBehind.resolvedAt} is null or ${s.fallingBehind.resolvedAt} > now() - interval '30 days'`)
      .orderBy(desc(s.fallingBehind.flaggedAt));
    return rows.map((r) => ({ ...r.f, teamName: r.teamName, courseId: r.courseId, courseCode: r.courseCode, name: r.name }));
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
  const L = await requestLocale();
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
    const assisted = new Set((await tx.select({ id: s.courseTas.courseId }).from(s.courseTas).where(eq(s.courseTas.userId, uid))).map((r) => r.id));

    return rows.map(({ c, instructorName, studentCount, teamTotal }) => {
      const courseTeams = teams.filter((t) => t.courseId === c.id);
      const placed = new Set(members.filter((m) => courseTeams.some((t) => t.id === m.teamId)).map((m) => m.userId));
      const roster = enrolled.filter((e) => e.courseId === c.id);
      const isMine = c.instructorId === uid;
      const myTeamId = members.find((m) => m.userId === uid && courseTeams.some((t) => t.id === m.teamId))?.teamId;
      return {
        id: c.id, code: c.code, title: c.title, term: c.term, description: c.description, goals: c.goals, rationale: c.rationale,
        instructorName: instructorName ?? translate(L, "Instructor"),
        isMine,
        isTA: assisted.has(c.id),
        enrolled: roster.some((e) => e.userId === uid),
        studentCount,
        teamCount: teamTotal,
        unplaced: isMine ? roster.filter((e) => !placed.has(e.userId)).length : 0,
        myTeam: courseTeams.find((t) => t.id === myTeamId)?.name ?? null,
        students: isMine || assisted.has(c.id) ? roster.map((e) => ({ id: e.userId, name: e.name })) : [],
        joinCode: isMine ? c.joinCode : null,
        joiningOpen: c.joiningOpen,
        archivedAt: c.archivedAt ? new Date(c.archivedAt).toISOString() : null,
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

/**
 * Creates a course. With `copyFrom` (one of your own courses) it also copies that course's milestones, rubric and
 * announcements. Milestone dates move forward by the whole weeks since that course was created, so a milestone keeps its
 * weekday and its place in the term; the instructor can edit them after.
 */
export async function createCourse(input: z.input<typeof CourseInput>, copyFrom?: string) {
  const c = CourseInput.parse(input);
  if (copyFrom) Id.parse(copyFrom);
  // RLS (courses_write) rejects non-instructors.
  await withUser(async (tx, uid) => {
    const [course] = await tx.insert(s.courses).values({ ...c, instructorId: uid }).returning({ id: s.courses.id });
    if (!copyFrom) return;
    const [src] = await tx.select({ createdAt: s.courses.createdAt }).from(s.courses)
      .where(and(eq(s.courses.id, copyFrom), eq(s.courses.instructorId, uid)));
    if (!src) throw new Error("You can only copy your own courses");
    const weeks = Math.max(0, Math.round((Date.now() - new Date(src.createdAt).getTime()) / (7 * 86_400_000)));
    await tx.execute(sql`
      insert into public.course_milestones (course_id, title, description, due_date, requires_submission)
      select ${course.id}, title, description, due_date + ${weeks * 7}::int, requires_submission
      from public.course_milestones where course_id = ${copyFrom}`);
    await tx.execute(sql`
      insert into public.rubric_criteria (course_id, name, max_points, position)
      select ${course.id}, name, max_points, position from public.rubric_criteria where course_id = ${copyFrom}`);
    // Same order as before: one statement shares one now(), so space them a second apart, newest first.
    await tx.execute(sql`
      insert into public.course_announcements (course_id, author_id, title, body, created_at)
      select ${course.id}, ${uid}, title, body, now() - (row_number() over (order by created_at desc) - 1) * interval '1 second'
      from public.course_announcements where course_id = ${copyFrom}`);
  });
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
  const paths = await withUser(async (tx) => [
    ...await tx.select({ path: s.files.storagePath }).from(s.files).where(inArray(s.files.teamId, teamIds)),
    // Hand-in files live in the same bucket but aren't in the files table.
    ...(await tx.select({ path: s.submissions.storagePath }).from(s.submissions).where(and(inArray(s.submissions.teamId, teamIds), isNotNull(s.submissions.storagePath))))
      .map((r) => ({ path: r.path as string })),
  ]);
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

export type EnrollOutcome = { email: string; outcome: "added" | "already" | "no_account" | "not_student" };
const Emails = z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1).max(200);

/** Enrolls existing student accounts by email; reports per address. Unknown addresses are left for the invite link. */
export async function enrollStudents(courseId: string, emails: string[]): Promise<EnrollOutcome[]> {
  Id.parse(courseId);
  const list = Emails.parse(emails);
  const rows = await withUser((tx) => tx.execute<{ address: string; outcome: EnrollOutcome["outcome"] }>(
    sql`select address, outcome from public.enroll_students(${courseId}, array[${sql.join(list.map((e) => sql`${e}`), sql`, `)}]::text[])`));
  return [...rows].map((r) => ({ email: r.address, outcome: r.outcome }));
}

/** Takes a student out of my course; a trigger also takes them off its teams. */
export async function removeStudent(courseId: string, userId: string) {
  Id.parse(courseId);
  Id.parse(userId);
  const rows = await withUser((tx) => tx.delete(s.courseEnrollments)
    .where(and(eq(s.courseEnrollments.courseId, courseId), eq(s.courseEnrollments.userId, userId)))
    .returning({ id: s.courseEnrollments.userId }));
  if (!rows.length) throw new Error("Student not found in your course");
}

/** A new invite code; the old link and code stop working. */
export async function resetJoinCode(courseId: string): Promise<string> {
  Id.parse(courseId);
  const [row] = await withUser((tx) => tx.update(s.courses).set({ joinCode: sql`public.new_join_code()` })
    .where(eq(s.courses.id, courseId)).returning({ code: s.courses.joinCode }));
  if (!row) throw new Error("Course not found or not yours");
  return row.code;
}

export async function setJoiningOpen(courseId: string, open: boolean) {
  Id.parse(courseId);
  z.boolean().parse(open);
  const rows = await withUser((tx) => tx.update(s.courses).set({ joiningOpen: open }).where(eq(s.courses.id, courseId)).returning({ id: s.courses.id }));
  if (!rows.length) throw new Error("Course not found or not yours");
}

/** Archive at term end (read-only for everyone; grading still works) or restore. */
export async function setCourseArchived(courseId: string, archived: boolean) {
  Id.parse(courseId);
  z.boolean().parse(archived);
  const rows = await withUser((tx) => tx.update(s.courses).set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(s.courses.id, courseId)).returning({ id: s.courses.id }));
  if (!rows.length) throw new Error("Course not found or not yours");
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

/** RLS (enroll_self_insert) enforces the same; this only turns its refusal into a message a student understands. */
async function assertJoinable(tx: Parameters<Parameters<typeof withUser>[0]>[0], courseId: string) {
  const [c] = await tx.select({ open: s.courses.joiningOpen, archivedAt: s.courses.archivedAt }).from(s.courses).where(eq(s.courses.id, courseId));
  if (!c) throw new Error("Course not found");
  if (c.archivedAt) throw new Error("This course has ended and is archived");
  if (!c.open) throw new Error("This course isn't accepting new students. Ask your instructor to add you.");
}

export async function joinCourse(id: string) {
  Id.parse(id);
  await withUser(async (tx, uid) => {
    await assertJoinable(tx, id);
    await tx.insert(s.courseEnrollments).values({ courseId: id, userId: uid }).onConflictDoNothing();
  });
}

// Invite codes are typed by hand too: ignore case, spaces and dashes.
const JoinCode = z.string().transform((v) => v.toUpperCase().replace(/[\s-]/g, "")).pipe(z.string().regex(/^[A-Z0-9]{6}$/, "Invite codes are 6 letters and digits"));

/** The course behind an invite code, or null when no course has it. */
export async function getInvite(code: string): Promise<CourseInvite | null> {
  const L = await requestLocale();
  const parsed = JoinCode.safeParse(code);
  if (!parsed.success) return null;
  return withUser(async (tx, uid) => {
    const [row] = await tx.select({ c: s.courses, instructorName: s.users.name }).from(s.courses)
      .leftJoin(s.users, eq(s.users.id, s.courses.instructorId)).where(eq(s.courses.joinCode, parsed.data));
    if (!row) return null;
    const [enrolled] = await tx.select({ id: s.courseEnrollments.userId }).from(s.courseEnrollments)
      .where(and(eq(s.courseEnrollments.courseId, row.c.id), eq(s.courseEnrollments.userId, uid)));
    return {
      id: row.c.id, code: row.c.code, title: row.c.title, term: row.c.term, instructorName: row.instructorName ?? translate(L, "Instructor"),
      enrolled: !!enrolled, isMine: row.c.instructorId === uid, open: row.c.joiningOpen && !row.c.archivedAt,
    };
  });
}

/** Joins the course behind an invite code and returns its id. RLS (enroll_self_insert) still applies: students only. */
export async function joinCourseByCode(code: string): Promise<string> {
  const joinCode = JoinCode.parse(code);
  return withUser(async (tx, uid) => {
    const [course] = await tx.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.joinCode, joinCode));
    if (!course) throw new Error("No course has that invite code");
    await assertJoinable(tx, course.id);
    await tx.insert(s.courseEnrollments).values({ courseId: course.id, userId: uid }).onConflictDoNothing();
    return course.id;
  });
}

export async function leaveCourse(id: string) {
  Id.parse(id);
  // A trigger also takes the student off this course's teams.
  await withUser((tx, uid) => tx.delete(s.courseEnrollments).where(and(eq(s.courseEnrollments.courseId, id), eq(s.courseEnrollments.userId, uid))));
}

// ─── Team editing (instructors) ────────────────────────────────────────

export type RosterStudent = { id: string; name: string; email: string; skills: string[]; teamId: string | null; teamName: string | null };

/** Everyone enrolled in a course, with the team each one is on (if any). RLS limits this to the course's instructor. */
export async function getCourseRoster(courseId: string): Promise<RosterStudent[]> {
  Id.parse(courseId);
  return withUser(async (tx) => {
    const students = await tx
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, skills: s.users.skills })
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

/** Creates a team in my course with these members. A student already on another team of the course moves over. */
export async function createTeam(courseId: string, input: z.infer<typeof TeamEdit>) {
  Id.parse(courseId);
  const t = TeamEdit.parse(input);
  const ids = [...new Set(t.memberIds)];
  return withUser(async (tx) => {
    const enrolled = await tx.select({ id: s.courseEnrollments.userId }).from(s.courseEnrollments)
      .where(and(eq(s.courseEnrollments.courseId, courseId), inArray(s.courseEnrollments.userId, ids)));
    if (enrolled.length !== ids.length) throw new Error("Every member must be enrolled in the course");
    // RLS (teams_write) rejects this unless the caller teaches the course.
    const [team] = await tx.insert(s.teams).values({ courseId, name: t.name, description: t.description }).returning({ id: s.teams.id });
    const courseTeams = tx.select({ id: s.teams.id }).from(s.teams).where(eq(s.teams.courseId, courseId));
    await tx.delete(s.teamMembers).where(and(inArray(s.teamMembers.teamId, courseTeams), inArray(s.teamMembers.userId, ids), ne(s.teamMembers.teamId, team.id)));
    await tx.insert(s.teamMembers).values(ids.map((userId) => ({ teamId: team.id, userId })));
    return team.id;
  });
}

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

// ─── Teaching assistants (the course's instructor manages them) ───────

export async function getCourseTAs(courseId: string): Promise<CourseTA[]> {
  Id.parse(courseId);
  return withUser(async (tx) => {
    const rows = await tx.select({ userId: s.courseTas.userId, name: s.users.name, email: s.users.email, addedAt: s.courseTas.addedAt }).from(s.courseTas)
      .innerJoin(s.users, eq(s.users.id, s.courseTas.userId)).where(eq(s.courseTas.courseId, courseId)).orderBy(asc(s.users.name));
    return rows;
  });
}

/** Adds a staff account as a TA by email. "not-staff" when no staff account has that email. */
export async function addCourseTA(courseId: string, email: string): Promise<"ok" | "not-staff" | "self"> {
  Id.parse(courseId);
  const e = z.email().parse(email.trim().toLowerCase());
  return withUser(async (tx, uid) => {
    await ownCourse(tx, uid, courseId);
    // Staff accounts are visible to everyone (users_select_instructors); students aren't, so they can't be found here.
    const [user] = await tx.select({ id: s.users.id }).from(s.users).where(and(sql`lower(${s.users.email}) = ${e}`, eq(s.users.role, "instructor")));
    if (!user) return "not-staff";
    if (user.id === uid) return "self";
    await tx.insert(s.courseTas).values({ courseId, userId: user.id }).onConflictDoNothing();
    return "ok";
  });
}

export async function removeCourseTA(courseId: string, userId: string) {
  Id.parse(courseId); Id.parse(userId);
  await withUser((tx) => tx.delete(s.courseTas).where(and(eq(s.courseTas.courseId, courseId), eq(s.courseTas.userId, userId))));
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
