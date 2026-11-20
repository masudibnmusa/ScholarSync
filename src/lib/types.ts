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
  students: string[]; // instructor only: names, for the roster preview
}
