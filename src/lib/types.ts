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
