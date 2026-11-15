"use client";

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import * as actions from "@/app/actions";
import type {
  ChatMessage, ConflictAlert, FileUpload, KanbanTask, Notification, Team, TaskSuggestion, UserProfile,
} from "@/lib/types";

// Client state for the signed-in app. It is filled only in the browser (effects and events),
// never during server rendering, so one user's data can't leak into another request.
export interface AppState {
  currentUser: UserProfile | null;
  selectedTeam: Team | null;
  teams: Team[];
  chatMessages: Record<string, ChatMessage[]>; // undefined for a team = not loaded yet
  kanbanTasks: KanbanTask[];
  notifications: Notification[];
  files: FileUpload[];
  conflictAlerts: ConflictAlert[];
  taskSuggestions: TaskSuggestion[];
  unreadNotifCount: number;
  loaded: { teams: boolean; tasks: boolean; files: boolean; notifications: boolean; conflicts: boolean };
  uploading: boolean;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  boot: (user: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
  setSelectedTeam: (team: Team | null) => void;

  fetchTeams: () => Promise<void>;
  fetchChatMessages: (teamId: string) => Promise<void>;
  fetchTasks: (teamId: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  fetchFiles: (teamId: string) => Promise<void>;
  fetchConflicts: () => Promise<void>;
  fetchSuggestions: (teamId: string) => Promise<void>;

  sendMessage: (teamId: string, content: string, fileId?: string) => Promise<boolean>;
  createTask: (teamId: string, data: { title: string; description: string; priority: string; dueDate: string; assigneeId: string }) => Promise<boolean>;
  updateTask: (taskId: string, data: Partial<KanbanTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  uploadFile: (teamId: string, file: File) => Promise<string | null>;
  downloadFile: (storagePath: string) => Promise<void>;
  submitPeerReview: (teamId: string, targetId: string, overallRating: number, feedback: string, categoryRatings: Record<string, number>) => Promise<boolean>;
  updateProfile: (data: { bio?: string; skills?: string[]; availability?: string }) => Promise<boolean>;
  resolveConflict: (id: string) => Promise<void>;
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
}

const BUCKET = "team-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

function fail(what: string, err: unknown) {
  console.error(`Failed to ${what}:`, err);
  toast.error(`Could not ${what}`, { description: err instanceof Error ? err.message : undefined });
}

// Realtime channels: one for the selected team (chat + board), one for the user's notifications.
// Names are unique per subscription: supabase.channel(name) returns an existing channel with the same
// name, and adding listeners to an already-subscribed channel throws.
let teamChannel: RealtimeChannel | null = null;
let userChannel: RealtimeChannel | null = null;
const channelName = (base: string) => `${base}-${crypto.randomUUID()}`;
let bootRun: Promise<void> | null = null; // StrictMode mounts twice; boot once

function closeChannels() {
  const sb = supabaseBrowser();
  if (teamChannel) sb.removeChannel(teamChannel);
  if (userChannel) sb.removeChannel(userChannel);
  teamChannel = userChannel = null;
}

const empty = {
  currentUser: null,
  selectedTeam: null,
  teams: [],
  chatMessages: {},
  kanbanTasks: [],
  notifications: [],
  files: [],
  conflictAlerts: [],
  taskSuggestions: [],
  unreadNotifCount: 0,
  loaded: { teams: false, tasks: false, files: false, notifications: false, conflicts: false },
  uploading: false,
  commandOpen: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...empty,
  setCommandOpen: (open) => set({ commandOpen: open }),

  // Loads everything for a signed-in session. The profile comes from the server layout.
  boot: (user) => (bootRun ??= (async () => {
    if (get().currentUser?.id === user.id && get().loaded.teams) return;
    closeChannels();
    set({ ...empty, currentUser: user });
    userChannel = supabaseBrowser()
      .channel(channelName(`user-${user.id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          get().fetchNotifications();
          // "AI suggested a task" arrives as a notification: refresh the suggestions it refers to.
          const team = get().selectedTeam;
          if (team && user.role === "student") get().fetchSuggestions(team.id);
        })
      .subscribe();
    await Promise.all([get().fetchTeams(), get().fetchNotifications(), user.role === "instructor" ? get().fetchConflicts() : null]);
  })().finally(() => { bootRun = null; })),

  logout: async () => {
    await supabaseBrowser().auth.signOut();
    closeChannels();
    set(empty);
  },

  setSelectedTeam: (team) => {
    const sb = supabaseBrowser();
    if (teamChannel) sb.removeChannel(teamChannel);
    teamChannel = null;
    set((s) => ({ selectedTeam: team, taskSuggestions: [], kanbanTasks: [], files: [], loaded: { ...s.loaded, tasks: false, files: false } }));
    if (!team) return;

    get().fetchChatMessages(team.id);
    get().fetchTasks(team.id);
    get().fetchFiles(team.id);
    if (get().currentUser?.role === "student") get().fetchSuggestions(team.id);

    // RLS applies to Realtime too: only members and the course instructor receive these rows.
    teamChannel = sb
      .channel(channelName(`team-${team.id}`))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${team.id}` },
        () => get().fetchChatMessages(team.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `team_id=eq.${team.id}` },
        () => { get().fetchTasks(team.id); get().fetchTeams(); })
      .subscribe();
  },

  fetchTeams: async () => {
    try {
      const teams = await actions.getTeams();
      const selected = get().selectedTeam;
      set((s) => ({ teams, selectedTeam: teams.find((t) => t.id === selected?.id) ?? selected, loaded: { ...s.loaded, teams: true } }));
      if (teams.length > 0 && !selected) get().setSelectedTeam(teams[0]);
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, teams: true } }));
      fail("load teams", err);
    }
  },

  fetchChatMessages: async (teamId) => {
    try {
      const messages = await actions.getMessages(teamId);
      const me = get().currentUser?.id;
      set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: messages.map((m) => ({ ...m, isMe: m.senderId === me })) } }));
    } catch (err) {
      set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: s.chatMessages[teamId] ?? [] } }));
      fail("load messages", err);
    }
  },

  fetchTasks: async (teamId) => {
    try {
      const kanbanTasks = await actions.getTasks(teamId);
      if (get().selectedTeam?.id === teamId) set((s) => ({ kanbanTasks, loaded: { ...s.loaded, tasks: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, tasks: true } }));
      fail("load tasks", err);
    }
  },

  fetchNotifications: async () => {
    try {
      const notifications = await actions.getNotifications();
      set((s) => ({ notifications, unreadNotifCount: notifications.filter((n) => !n.read).length, loaded: { ...s.loaded, notifications: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, notifications: true } }));
      fail("load notifications", err);
    }
  },

  fetchFiles: async (teamId) => {
    try {
      const files = await actions.getFiles(teamId);
      if (get().selectedTeam?.id === teamId) set((s) => ({ files, loaded: { ...s.loaded, files: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, files: true } }));
      fail("load files", err);
    }
  },

  fetchConflicts: async () => {
    try {
      const conflictAlerts = await actions.getConflicts();
      set((s) => ({ conflictAlerts, loaded: { ...s.loaded, conflicts: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, conflicts: true } }));
      fail("load conflict alerts", err);
    }
  },

  fetchSuggestions: async (teamId) => {
    try {
      const taskSuggestions = await actions.getSuggestions(teamId);
      if (get().selectedTeam?.id === teamId) set({ taskSuggestions });
    } catch (err) {
      console.error("Failed to load AI suggestions:", err); // background refresh: no toast
    }
  },

  // Chat: the Realtime subscription refreshes every open client, including this one.
  sendMessage: async (teamId, content, fileId) => {
    try {
      await actions.sendMessage(teamId, content, fileId);
      await get().fetchChatMessages(teamId);
      return true;
    } catch (err) {
      fail("send the message", err);
      return false;
    }
  },

  createTask: async (teamId, data) => {
    try {
      await actions.createTask(teamId, data);
      await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
      return true;
    } catch (err) {
      fail("create the task", err);
      return false;
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
    if (teamId) await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
  },

  deleteTask: async (taskId) => {
    try {
      await actions.deleteTask(taskId);
      const teamId = get().selectedTeam?.id;
      if (teamId) await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
    } catch (err) {
      fail("delete the task", err);
    }
  },

  markNotificationRead: async (id) => {
    set((s) => {
      const notifications = s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      return { notifications, unreadNotifCount: notifications.filter((n) => !n.read).length };
    });
    try {
      await actions.markNotificationRead(id);
    } catch (err) {
      fail("update the notification", err);
      await get().fetchNotifications();
    }
  },

  markAllNotificationsRead: async () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadNotifCount: 0 }));
    try {
      await actions.markAllNotificationsRead();
    } catch (err) {
      fail("update notifications", err);
      await get().fetchNotifications();
    }
  },

  // Files: bytes go straight to Storage (checked by storage RLS), then a Server Action records the row.
  uploadFile: async (teamId, file) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File is too large", { description: `${file.name} is over 50 MB.` });
      return null;
    }
    const sb = supabaseBrowser();
    const path = `${teamId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    set({ uploading: true });
    try {
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      let id: string;
      try {
        id = await actions.recordFile({ teamId, name: file.name, storagePath: path, size: file.size, mimeType: file.type });
      } catch (err) {
        await sb.storage.from(BUCKET).remove([path]); // don't leave an orphaned object behind
        throw err;
      }
      await get().fetchFiles(teamId);
      return id;
    } catch (err) {
      fail("upload the file", err);
      return null;
    } finally {
      set({ uploading: false });
    }
  },

  downloadFile: async (storagePath) => {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(storagePath, 60, { download: true });
    if (error || !data) return fail("download the file", error);
    window.location.assign(data.signedUrl);
  },

  submitPeerReview: async (teamId, targetId, overallRating, feedback, categoryRatings) => {
    try {
      await actions.submitPeerReview(teamId, targetId, overallRating, feedback, categoryRatings);
      return true;
    } catch (err) {
      const duplicate = err instanceof Error && /duplicate|unique/i.test(err.message);
      if (duplicate) toast.error("Already reviewed", { description: "You have already reviewed this teammate." });
      else fail("submit the review", err);
      return false;
    }
  },

  updateProfile: async (data) => {
    try {
      await actions.updateProfile(data);
      set({ currentUser: await actions.getProfile() });
      return true;
    } catch (err) {
      fail("save your profile", err);
      return false;
    }
  },

  resolveConflict: async (id) => {
    try {
      await actions.resolveConflict(id);
      await get().fetchConflicts();
    } catch (err) {
      fail("resolve the alert", err);
    }
  },

  acceptSuggestion: async (id) => {
    try {
      await actions.acceptSuggestion(id);
      set((s) => ({ taskSuggestions: s.taskSuggestions.filter((t) => t.id !== id) }));
      const teamId = get().selectedTeam?.id;
      if (teamId) await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
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
