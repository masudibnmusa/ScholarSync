"use client";

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import * as actions from "@/app/actions";

export type UserRole = "student" | "instructor";
export type View =
  | "login"
  | "register"
  | "student-dashboard"
  | "student-chat"
  | "student-tasks"
  | "student-files"
  | "student-notifications"
  | "student-peer-review"
  | "student-profile"
  | "instructor-dashboard"
  | "instructor-teams"
  | "instructor-analytics"
  | "instructor-conflicts"
  | "instructor-matching";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
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
  members: { id: string; name: string }[];
}

export interface AppState {
  // Auth
  currentView: View;
  currentUser: UserProfile | null;
  isLoading: boolean;
  error: string | null;

  // Navigation
  selectedTeam: Team | null;
  sidebarCollapsed: boolean;

  // Data
  teams: Team[];
  chatMessages: Record<string, ChatMessage[]>;
  kanbanTasks: KanbanTask[];
  notifications: Notification[];
  files: FileUpload[];
  conflictAlerts: ConflictAlert[];
  taskSuggestions: TaskSuggestion[];
  showAIModal: boolean;
  unreadNotifCount: number;

  // Actions
  setView: (view: View) => void;
  setLoading: (loading: boolean) => void;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string, role: string) => Promise<boolean>;
  logout: () => Promise<void>;
  reset: () => void;
  setCurrentUser: (user: UserProfile | null) => void;
  setSelectedTeam: (team: Team | null) => void;
  toggleSidebar: () => void;
  dismissAIModal: () => void;

  // Data fetching
  fetchTeams: () => Promise<void>;
  fetchChatMessages: (teamId: string) => Promise<void>;
  fetchTasks: (teamId: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  fetchFiles: (teamId: string) => Promise<void>;
  fetchProfile: () => Promise<void>;
  fetchConflicts: () => Promise<void>;
  fetchSuggestions: (teamId: string) => Promise<void>;

  // Chat actions
  sendMessage: (teamId: string, content: string, fileId?: string) => Promise<void>;

  // Task actions
  createTask: (teamId: string, data: { title: string; description: string; priority: string; dueDate: string; assigneeId: string }) => Promise<void>;
  updateTask: (taskId: string, data: Partial<KanbanTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // Notification actions
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  // File actions
  uploadFile: (teamId: string, file: File) => Promise<void>;
  downloadFile: (storagePath: string) => Promise<void>;

  // Peer review
  submitPeerReview: (teamId: string, targetId: string, overallRating: number, feedback: string, categoryRatings: Record<string, number>) => Promise<boolean>;

  // Profile actions
  updateProfile: (data: { bio?: string; skills?: string[]; availability?: string }) => Promise<void>;

  // Conflict actions
  resolveConflict: (id: string) => Promise<void>;

  // AI suggestions
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
}

const BUCKET = "team-files";

function fail(what: string, err: unknown) {
  console.error(`Failed to ${what}:`, err);
  toast({ title: `Could not ${what}`, description: err instanceof Error ? err.message : undefined, variant: "destructive" });
}

// Realtime channels: one for the selected team (chat + board), one for the user's notifications.
// Names are unique per subscription: supabase.channel(name) returns an existing channel with the same
// name, and adding listeners to an already-subscribed channel throws.
let teamChannel: RealtimeChannel | null = null;
let userChannel: RealtimeChannel | null = null;
const channelName = (base: string) => `${base}-${crypto.randomUUID()}`;
let initRun: Promise<void> | null = null; // StrictMode and login can both call init(); run it once

function closeChannels() {
  const sb = supabaseBrowser();
  if (teamChannel) sb.removeChannel(teamChannel);
  if (userChannel) sb.removeChannel(userChannel);
  teamChannel = userChannel = null;
}

const empty = {
  currentUser: null,
  currentView: "login" as View,
  selectedTeam: null,
  teams: [],
  chatMessages: {},
  kanbanTasks: [],
  notifications: [],
  files: [],
  conflictAlerts: [],
  taskSuggestions: [],
  unreadNotifCount: 0,
  showAIModal: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...empty,
  isLoading: false,
  error: null,
  sidebarCollapsed: false,

  setView: (view) => set({ currentView: view }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Loads everything for a signed-in session (after login, or on page load with an existing session).
  init: () => (initRun ??= (async () => {
    try {
      const user = await actions.getProfile();
      set({ currentUser: user, currentView: user.role === "instructor" ? "instructor-dashboard" : "student-dashboard" });

      if (userChannel) supabaseBrowser().removeChannel(userChannel);
      userChannel = supabaseBrowser()
        .channel(channelName(`user-${user.id}`))
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => get().fetchNotifications())
        .subscribe();

      await Promise.all([get().fetchTeams(), get().fetchNotifications(), user.role === "instructor" ? get().fetchConflicts() : null]);
    } catch (err) {
      fail("load your account", err);
    }
  })().finally(() => { initRun = null; })),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      set({ isLoading: false, error: error.message });
      return false;
    }
    await get().init();
    set({ isLoading: false });
    return true;
  },

  register: async (name, email, password, role) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) {
      set({ isLoading: false, error: error.message });
      return false;
    }
    if (role === "instructor") {
      toast({ title: "Registered as a student", description: "Instructor accounts are approved by an administrator." });
    }
    if (!data.session) {
      set({ isLoading: false, error: "Check your email to confirm your account, then sign in." });
      return false;
    }
    await get().init();
    set({ isLoading: false });
    return true;
  },

  logout: async () => {
    await supabaseBrowser().auth.signOut();
    get().reset();
  },

  reset: () => {
    closeChannels();
    set({ ...empty, error: null });
  },

  setCurrentUser: (user) => set({ currentUser: user }),

  setSelectedTeam: (team) => {
    set({ selectedTeam: team, taskSuggestions: [] });
    const sb = supabaseBrowser();
    if (teamChannel) sb.removeChannel(teamChannel);
    teamChannel = null;
    if (!team) return;

    get().fetchChatMessages(team.id);
    get().fetchTasks(team.id);
    get().fetchFiles(team.id);

    // RLS applies to Realtime too: only members and the course instructor receive these rows.
    teamChannel = sb
      .channel(channelName(`team-${team.id}`))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${team.id}` },
        () => get().fetchChatMessages(team.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `team_id=eq.${team.id}` },
        () => get().fetchTasks(team.id))
      .subscribe();
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  dismissAIModal: () => set({ showAIModal: false }),

  // Data fetching
  fetchTeams: async () => {
    try {
      const teams = await actions.getTeams();
      const selected = get().selectedTeam;
      set({ teams, selectedTeam: teams.find((t) => t.id === selected?.id) ?? selected });
      if (teams.length > 0 && !selected) get().setSelectedTeam(teams[0]);
    } catch (err) {
      fail("load teams", err);
    }
  },

  fetchChatMessages: async (teamId) => {
    try {
      const messages = await actions.getMessages(teamId);
      const me = get().currentUser?.id;
      set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: messages.map((m) => ({ ...m, isMe: m.senderId === me })) } }));
    } catch (err) {
      fail("load messages", err);
    }
  },

  fetchTasks: async (teamId) => {
    try {
      const kanbanTasks = await actions.getTasks(teamId);
      if (get().selectedTeam?.id === teamId) set({ kanbanTasks });
    } catch (err) {
      fail("load tasks", err);
    }
  },

  fetchNotifications: async () => {
    try {
      const notifications = await actions.getNotifications();
      set({ notifications, unreadNotifCount: notifications.filter((n) => !n.read).length });
    } catch (err) {
      fail("load notifications", err);
    }
  },

  fetchFiles: async (teamId) => {
    try {
      const files = await actions.getFiles(teamId);
      if (get().selectedTeam?.id === teamId) set({ files });
    } catch (err) {
      fail("load files", err);
    }
  },

  fetchProfile: async () => {
    try {
      set({ currentUser: await actions.getProfile() });
    } catch (err) {
      fail("load your profile", err);
    }
  },

  fetchConflicts: async () => {
    try {
      set({ conflictAlerts: await actions.getConflicts() });
    } catch (err) {
      fail("load conflict alerts", err);
    }
  },

  fetchSuggestions: async (teamId) => {
    try {
      set({ taskSuggestions: await actions.getSuggestions(teamId) });
    } catch (err) {
      fail("load AI suggestions", err);
    }
  },

  // Chat: the Realtime subscription refreshes every open client, including this one.
  sendMessage: async (teamId, content, fileId) => {
    try {
      await actions.sendMessage(teamId, content, fileId);
      await get().fetchChatMessages(teamId);
    } catch (err) {
      fail("send the message", err);
    }
  },

  // Tasks
  createTask: async (teamId, data) => {
    try {
      await actions.createTask(teamId, data);
      await get().fetchTasks(teamId);
    } catch (err) {
      fail("create the task", err);
    }
  },

  updateTask: async (taskId, data) => {
    // Optimistic: move the card now, then reload the board from the server.
    set((s) => ({ kanbanTasks: s.kanbanTasks.map((t) => (t.id === taskId ? { ...t, ...data } : t)) }));
    try {
      await actions.updateTask(taskId, data);
    } catch (err) {
      fail("update the task", err);
    }
    const teamId = get().selectedTeam?.id;
    if (teamId) await get().fetchTasks(teamId);
  },

  deleteTask: async (taskId) => {
    try {
      await actions.deleteTask(taskId);
      const teamId = get().selectedTeam?.id;
      if (teamId) await get().fetchTasks(teamId);
    } catch (err) {
      fail("delete the task", err);
    }
  },

  // Notifications
  markNotificationRead: async (id) => {
    try {
      await actions.markNotificationRead(id);
      await get().fetchNotifications();
    } catch (err) {
      fail("update the notification", err);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      await actions.markAllNotificationsRead();
      await get().fetchNotifications();
    } catch (err) {
      fail("update notifications", err);
    }
  },

  // Files: bytes go straight to Storage (checked by storage RLS), then a Server Action records the row.
  uploadFile: async (teamId, file) => {
    const sb = supabaseBrowser();
    const path = `${teamId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    set({ isLoading: true });
    try {
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      try {
        await actions.recordFile({ teamId, name: file.name, storagePath: path, size: file.size, mimeType: file.type });
      } catch (err) {
        await sb.storage.from(BUCKET).remove([path]); // don't leave an orphaned object behind
        throw err;
      }
      await get().fetchFiles(teamId);
      toast({ title: "File uploaded", description: file.name });
    } catch (err) {
      fail("upload the file", err);
    } finally {
      set({ isLoading: false });
    }
  },

  downloadFile: async (storagePath) => {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(storagePath, 60, { download: true });
    if (error || !data) return fail("download the file", error);
    window.location.assign(data.signedUrl);
  },

  // Peer Review
  submitPeerReview: async (teamId, targetId, overallRating, feedback, categoryRatings) => {
    try {
      await actions.submitPeerReview(teamId, targetId, overallRating, feedback, categoryRatings);
      return true;
    } catch (err) {
      fail("submit the review", err);
      return false;
    }
  },

  // Profile
  updateProfile: async (data) => {
    try {
      await actions.updateProfile(data);
      await get().fetchProfile();
    } catch (err) {
      fail("save your profile", err);
    }
  },

  // Conflicts
  resolveConflict: async (id) => {
    try {
      await actions.resolveConflict(id);
      await get().fetchConflicts();
    } catch (err) {
      fail("resolve the alert", err);
    }
  },

  // AI suggestions
  acceptSuggestion: async (id) => {
    try {
      await actions.acceptSuggestion(id);
      const teamId = get().selectedTeam?.id;
      if (teamId) await Promise.all([get().fetchSuggestions(teamId), get().fetchTasks(teamId)]);
    } catch (err) {
      fail("add the task", err);
    }
  },

  dismissSuggestion: async (id) => {
    try {
      await actions.dismissSuggestion(id);
      set((s) => ({ taskSuggestions: s.taskSuggestions.filter((t) => t.id !== id) }));
    } catch (err) {
      fail("dismiss the suggestion", err);
    }
  },
}));
