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
}

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

export interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  /** Teams (that the viewer can see) which marked this milestone done. */
  completions: { teamId: string; completedAt: string }[];
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
  kind: "task" | "milestone";
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
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
