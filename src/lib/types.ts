// Shapes the Server Actions return (the API contract for any frontend).

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  fromInstructor?: boolean;
  content: string;
  timestamp: string;
  isMe: boolean;
  fileName?: string | null;
  fileSize?: string | null;
  filePath?: string | null;
  /** The message this one answers, as a short quote. */
  replyTo?: { id: string; senderName: string; snippet: string } | null;
  reactions?: { emoji: string; count: number; mine: boolean; names: string[] }[];
  /** Typed offline; waiting in the outbox (src/lib/offline.ts). */
  pending?: boolean;
}

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const; // same list as the database check

/** One result of the search in the command menu (Ctrl+K), across every course and team the person can see. */
export interface SearchHit {
  kind: "task" | "message" | "file" | "milestone" | "announcement";
  id: string;
  /** The task, file, milestone or announcement title, or the message text. */
  text: string;
  /** Where it is: the team (or course) and, for messages and files, who wrote or shared it. */
  where: string;
  teamId: string | null;
  courseId: string;
  /** Files: what to download. */
  storagePath?: string;
  at: string;
}

export type ChatSearchHit =
  | { kind: "message"; id: string; senderName: string; content: string; timestamp: string }
  | { kind: "file"; id: string; name: string; storagePath: string; size: string; uploadedBy: string; timestamp: string };

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "done";
  assigneeId: string | null;
  assigneeName: string;
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  commentCount: number;
  checklistDone: number;
  checklistTotal: number;
}

export interface ChecklistItem {
  id: string;
  body: string;
  done: boolean;
}

export interface WeeklySummary {
  weekStart: string;
  summary: string;
  done: string[];
  late: string[];
  decisions: string[];
  generatedAt: string;
}

export interface StandupAnswer {
  userId: string;
  name: string;
  done: string;
  next: string;
  blocked: string;
  updatedAt: string;
}

/** This week's stand-up for one team. `summary` is the AI's, and only instructors get it. */
export interface TeamStandup {
  weekStart: string;
  members: { userId: string; name: string }[];
  answers: StandupAnswer[];
  summary: { summary: string; blockers: string[]; answered: number; generatedAt: string } | null;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  /** Teams hand in work (a file or link) for this milestone. */
  requiresSubmission: boolean;
  /** Teams (that the viewer can see) which marked this milestone done. */
  completions: { teamId: string; completedAt: string }[];
  /** Hand-ins the viewer can see: every team's for the instructor, their own team's for a student. */
  submissions: Submission[];
  /** Requests for more time the viewer can see (same rule as hand-ins). */
  extensions: Extension[];
}

/** A team's request for more time on a milestone. `approvedDate` is the team's due date once one was approved. */
export interface Extension {
  teamId: string;
  newDate: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  approvedDate: string | null;
  requestedByName: string;
  requestedAt: string;
}

/** A team's due date for a milestone: an approved extension, else the course's date. */
export const dueFor = (m: Pick<Milestone, "dueDate" | "extensions">, teamId: string) =>
  m.extensions.find((x) => x.teamId === teamId)?.approvedDate ?? m.dueDate;

export interface Submission {
  teamId: string;
  link: string | null;
  storagePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  note: string;
  submittedByName: string;
  submittedAt: string;
  feedback: string;
  feedbackAt: string | null;
}

export interface RubricCriterion {
  id: string;
  name: string;
  maxPoints: number;
}

export type CriterionScore = { points: number; feedback: string };

export interface GradedMember {
  userId: string;
  name: string;
  peerAvg: number | null;
  reviews: number;
  suggestedFactor: number;
  /** The instructor's override, if any; otherwise the suggestion applies. */
  override: number | null;
}

export interface CourseGrading {
  released: boolean;
  criteria: RubricCriterion[];
  teams: { teamId: string; teamName: string; scores: Record<string, CriterionScore>; members: GradedMember[] }[];
}

export interface MyGrade {
  teamName: string;
  criteria: RubricCriterion[];
  scores: Record<string, CriterionScore>;
  factor: number;
}

export interface MyReview {
  revieweeId: string;
  rating: number;
  categoryRatings: Record<string, number>;
  feedback: string;
  createdAt: string;
}

/** One dated item on a student's "My week" page. */
export interface WeekItem {
  kind: "task" | "milestone" | "office-hours";
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (office hours: the day in the slot's time zone)
  /** Office hours only: when, how long and where. */
  startsAt?: string;
  minutes?: number;
  location?: string;
  teamId: string;
  teamName: string;
  courseId: string;
  courseCode: string;
  priority?: KanbanTask["priority"];
  status?: KanbanTask["status"];
}

export interface TaskComment {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  bio: string;
  skills: string[];
  availability: string;
  contribution: number;
}

export interface Team {
  id: string;
  courseId: string;
  courseCode: string;
  courseArchived: boolean; // read-only: the course was archived
  name: string;
  description: string;
  healthScore: number;
  progress: number;
  members: TeamMember[];
  _count?: { tasks: number; messages: number };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  link?: string | null;
}

export interface FileUpload {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  uploaderId: string | null;
  createdAt: string;
  storagePath: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  bio: string;
  skills: string[];
  availability: string;
  emailDigest: boolean;
  avatarPath: string | null;
  githubLogin: string | null;
  locale: "en" | "bn";
}

export interface ConflictAlert {
  id: string;
  teamId: string;
  teamName: string;
  severity: string;
  description: string;
  sentimentScore: number;
  isResolved: boolean;
  createdAt: string;
}

export interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  source: string;
}

export interface MatchProposal {
  name: string;
  score: number;
  strengths: string[];
  members: { id: string; name: string; skills: string[]; availability: string }[];
}

export interface Course {
  id: string;
  code: string;
  title: string;
  term: string;
  description: string; // what the course is
  goals: string;
  rationale: string; // why take it
  instructorName: string;
  isMine: boolean; // I teach it
  enrolled: boolean;
  studentCount: number;
  teamCount: number; // every team in the course
  unplaced: number; // instructor only: enrolled students not on a team yet
  myTeam: string | null; // student only
  students: { id: string; name: string }[]; // instructor only: for the roster preview
  joinCode: string | null; // instructor only: the invite code (/join/<code>)
  joiningOpen: boolean; // students can join on their own
  archivedAt: string | null; // set: the term is over and the course is read-only
}

export interface CourseInvite {
  id: string;
  code: string;
  title: string;
  term: string;
  instructorName: string;
  enrolled: boolean;
  isMine: boolean;
  open: boolean; // accepting new students (open and not archived)
}

export interface TeamReview {
  id: string;
  reviewerName: string;
  revieweeId: string;
  revieweeName: string;
  rating: number;
  feedback: string;
  createdAt: string;
  flags: ("far-from-others" | "all-lowest")[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface TaskEvent {
  id: number;
  actorName: string | null;
  field: "created" | "status" | "assignee" | "due_date" | "priority" | "title";
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** A student flagged by the daily falling-behind check (instructor view). `resolvedAt` set = recovered. */
export interface AtRiskStudent {
  courseId: string;
  teamId: string;
  teamName: string;
  courseCode: string;
  userId: string;
  name: string;
  reasons: string[];
  flaggedAt: string;
  escalatedAt: string | null;
  resolvedAt: string | null;
}

/** One student's work in one course, for the contribution report. `peer` and `atRisk` are for the instructor only. */
/** A question on a course's peer help board, with its answers (oldest first). */
export interface HelpQuestion {
  id: string;
  title: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  /** The answer the asker marked as the one that solved it. */
  solvedBy: string | null;
  answers: { id: string; body: string; authorId: string | null; authorName: string; byInstructor: boolean; createdAt: string }[];
}

export interface Contribution {
  course: { id: string; code: string; title: string };
  student: { id: string; name: string };
  /** The course's help board: answers the student gave, and how many solved the question. */
  helped: { answers: number; solved: number };
  team: null | {
    id: string;
    name: string;
    joinedAt: string;
    members: { userId: string; name: string; tasksDone: number; tasksAssigned: number; messages: number; files: number; standups: number; commits: number; githubLogin: string | null }[];
    /** The linked GitHub repo (owner/name), if any. */
    repo: string | null;
    /** Weeks in which anyone on the team answered the stand-up. */
    standupWeeks: number;
    tasks: { id: string; title: string; status: KanbanTask["status"]; dueDate: string | null; doneAt: string | null }[];
    /** The last 8 weeks, oldest first; `week` is the Monday (YYYY-MM-DD). */
    weeks: { week: string; tasks: number; messages: number }[];
    peer: null | { avg: number | null; n: number; categories: Record<string, number>; feedback: { text: string; at: string }[] };
    atRisk: string[] | null;
  };
}

/** A team's linked GitHub repo and its recent commits and pull requests. */
export interface RepoFeed {
  repo: string | null;
  syncedAt: string | null;
  error: string | null;
  members: { userId: string; name: string; githubLogin: string | null; commits: number }[];
  activity: {
    id: string;
    kind: "commit" | "pr";
    title: string;
    url: string;
    state: "open" | "closed" | "merged" | null;
    at: string;
    /** The team member it's matched to by GitHub username, else the GitHub name. */
    userId: string | null;
    author: string;
  }[];
}

export interface CharterText {
  roles: string;
  meetings: string;
  missedWork: string;
  communication: string;
}

/** A team's charter (null = not written yet) and who of the current members has agreed to this version. */
export interface TeamCharter {
  charter: (CharterText & { updatedAt: string; updatedByName: string | null }) | null;
  members: { userId: string; name: string; agreedAt: string | null }[];
}

/** One office-hours slot. For students, other teams' bookings show only as taken (no team name or topic). */
export interface OfficeHourSlot {
  id: string;
  startsAt: string;
  minutes: number;
  location: string;
  booked: boolean;
  mine: boolean;
  teamName: string | null;
  topic: string;
  bookedByName: string | null;
}

/** Weekly history for one course's teams (oldest week first; null = no data for that week yet). */
export interface CourseTrends {
  weeks: string[]; // Mondays, YYYY-MM-DD
  teams: { id: string; name: string; done: number[]; messages: number[]; health: (number | null)[]; progress: (number | null)[] }[];
}
