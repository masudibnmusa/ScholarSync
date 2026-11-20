// Mirrors supabase/migrations/0001_init.sql. The SQL migrations are the source of truth; keep this in sync.
import {
  pgTable, pgEnum, pgView, uuid, text, timestamp, smallint, doublePrecision, date, bigint, jsonb, numeric, integer, primaryKey, boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["student", "instructor"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high"]);
export const alertSeverity = pgEnum("alert_severity", ["low", "medium", "high"]);
export const notificationType = pgEnum("notification_type", ["task", "message", "review", "conflict", "system"]);
export const suggestionStatus = pgEnum("suggestion_status", ["pending", "accepted", "dismissed"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: userRole("role").notNull(),
  bio: text("bio").notNull(),
  skills: text("skills").array().notNull(),
  availability: text("availability").notNull(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  term: text("term").notNull(),
  description: text("description").notNull().default(""),
  goals: text("goals").notNull().default(""),
  rationale: text("rationale").notNull().default(""),
  gradesReleased: boolean("grades_released").notNull().default(false),
  joinCode: text("join_code").notNull().default(sql`public.new_join_code()`),
  instructorId: uuid("instructor_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const courseEnrollments = pgTable("course_enrollments", {
  courseId: uuid("course_id").notNull(),
  userId: uuid("user_id").notNull(),
  enrolledAt: ts("enrolled_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.courseId, t.userId] })]);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  healthScore: smallint("health_score"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teamMembers = pgTable("team_members", {
  teamId: uuid("team_id").notNull(),
  userId: uuid("user_id").notNull(),
  joinedAt: ts("joined_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] })]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: taskStatus("status").notNull().default("todo"),
  priority: taskPriority("priority").notNull().default("medium"),
  position: doublePrecision("position").notNull().default(0),
  assigneeId: uuid("assignee_id"),
  createdBy: uuid("created_by"),
  dueDate: date("due_date"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  uploaderId: uuid("uploader_id"),
  name: text("name").notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  senderId: uuid("sender_id"),
  content: text("content").notNull().default(""),
  fileId: uuid("file_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: notificationType("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: ts("read_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const peerReviews = pgTable("peer_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  reviewerId: uuid("reviewer_id").notNull(),
  revieweeId: uuid("reviewee_id").notNull(),
  rating: smallint("rating").notNull(),
  categoryRatings: jsonb("category_ratings").$type<Record<string, number>>().notNull().default({}),
  feedback: text("feedback").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const conflictAlerts = pgTable("conflict_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  severity: alertSeverity("severity").notNull(),
  summary: text("summary").notNull(),
  sentiment: numeric("sentiment", { precision: 4, scale: 3, mode: "number" }).notNull(),
  resolvedAt: ts("resolved_at"),
  resolvedBy: uuid("resolved_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const taskSuggestions = pgTable("task_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull(),
  sourceMessageId: uuid("source_message_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: suggestionStatus("status").notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  authorId: uuid("author_id"),
  body: text("body").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teamSummaries = pgTable("team_summaries", {
  teamId: uuid("team_id").notNull(),
  weekStart: date("week_start").notNull(),
  summary: text("summary").notNull(),
  done: text("done").array().notNull(),
  late: text("late").array().notNull(),
  decisions: text("decisions").array().notNull(),
  generatedAt: ts("generated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.teamId, t.weekStart] })]);

export const courseMilestones = pgTable("course_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: date("due_date").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teamMilestones = pgTable("team_milestones", {
  teamId: uuid("team_id").notNull(),
  milestoneId: uuid("milestone_id").notNull(),
  completedAt: ts("completed_at").notNull().defaultNow(),
  completedBy: uuid("completed_by"),
}, (t) => [primaryKey({ columns: [t.teamId, t.milestoneId] })]);

export const rubricCriteria = pgTable("rubric_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull(),
  name: text("name").notNull(),
  maxPoints: integer("max_points").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teamGrades = pgTable("team_grades", {
  teamId: uuid("team_id").notNull(),
  criterionId: uuid("criterion_id").notNull(),
  points: numeric("points", { precision: 6, scale: 1, mode: "number" }).notNull(),
  feedback: text("feedback").notNull().default(""),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.teamId, t.criterionId] })]);

export const studentGradeFactors = pgTable("student_grade_factors", {
  teamId: uuid("team_id").notNull(),
  userId: uuid("user_id").notNull(),
  factor: numeric("factor", { precision: 4, scale: 2, mode: "number" }).notNull(),
  overridden: boolean("overridden").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] })]);

export const teamProgress = pgView("team_progress", {
  teamId: uuid("team_id").notNull(),
  totalTasks: bigint("total_tasks", { mode: "number" }).notNull(),
  doneTasks: bigint("done_tasks", { mode: "number" }).notNull(),
  progressPct: integer("progress_pct").notNull(),
}).existing();

export const memberContribution = pgView("member_contribution", {
  teamId: uuid("team_id").notNull(),
  userId: uuid("user_id").notNull(),
  tasksDone: bigint("tasks_done", { mode: "number" }).notNull(),
  tasksAssigned: bigint("tasks_assigned", { mode: "number" }).notNull(),
}).existing();
