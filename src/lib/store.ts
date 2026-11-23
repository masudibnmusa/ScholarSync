"use client";

import * as React from "react";
import { create } from "zustand";
import * as Sentry from "@sentry/nextjs";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import * as actions from "@/app/actions";
import { clearOffline, flushOutbox, isOffline, outbox, queueMessage, withSnapshot, type QueuedMessage } from "@/lib/offline";
import type {
  ChatMessage, ConflictAlert, FileUpload, KanbanTask, Notification, Team, TaskSuggestion, UserProfile,
} from "@/lib/types";
import { t } from "@/lib/i18n";

// Client state for the signed-in app. The store itself is filled only in the browser, never during server rendering,
// so one user's data can't leak into another request. The first data comes from the server layout instead: it renders
// through a per-request snapshot (AppStoreSnapshot), and the browser store starts from the same data.
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
  /** Instructors: open falling-behind cases, for the At risk badge. */
  atRiskCount: number;
  loaded: { teams: boolean; tasks: boolean; files: boolean; notifications: boolean; conflicts: boolean };
  uploading: boolean;
  commandOpen: boolean;
  /** Profile photo URLs by user id, for everyone this user can see. Missing = show initials. */
  avatars: Record<string, string>;
  /** Bumped when another tab or person changes a table; pages add `useLive(...)` to their reload effect. */
  live: Partial<Record<LiveTable, number>>;
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
  fetchAtRiskCount: () => Promise<void>;
  fetchSuggestions: (teamId: string) => Promise<void>;

  sendMessage: (teamId: string, content: string, fileId?: string, replyTo?: string) => Promise<boolean>;
  /** Sends chat messages typed while offline. */
  sendQueued: () => Promise<void>;
  toggleReaction: (teamId: string, messageId: string, emoji: string) => Promise<void>;
  createTask: (teamId: string, data: { title: string; description: string; priority: string; dueDate: string; assigneeId: string }) => Promise<boolean>;
  updateTask: (taskId: string, data: Partial<KanbanTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  uploadFile: (teamId: string, file: File) => Promise<string | null>;
  downloadFile: (storagePath: string) => Promise<void>;
  deleteFile: (teamId: string, fileId: string) => Promise<boolean>;
  submitPeerReview: (teamId: string, targetId: string, overallRating: number, feedback: string, categoryRatings: Record<string, number>) => Promise<boolean>;
  updateProfile: (data: { bio?: string; skills?: string[]; availability?: string; emailDigest?: boolean; githubLogin?: string }) => Promise<boolean>;
  /** Uploads a new profile photo, or removes it with null. */
  setAvatar: (file: File | null) => Promise<boolean>;
  fetchAvatars: () => Promise<void>;
  resolveConflict: (id: string) => Promise<void>;
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
}

const BUCKET = "team-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]; // same list as the avatars bucket
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** The public URL of a profile photo (what storage.getPublicUrl builds), without a client, so the server can make it too. */
const avatarUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;

function fail(what: string, err: unknown) {
  console.error(`Failed to ${what}:`, err);
  toast.error(t("Could not {what}", { what }), { description: isOffline(err) ? t("You're offline.") : err instanceof Error ? t(err.message) : undefined });
}
// Loads with no saved copy while offline stay quiet: the offline banner already says why.
const loadFail = (what: string, err: unknown) => (isOffline(err) ? console.warn(`Offline, could not ${what}`) : fail(what, err));

/** Messages typed offline, shown at the end of their team's thread until they're sent. */
const pendingFor = (q: QueuedMessage[], teamId: string, user: UserProfile): ChatMessage[] =>
  q.filter((m) => m.teamId === teamId).map((m) => ({
    id: `pending-${m.key}`, senderId: user.id, senderName: user.name, content: m.content, timestamp: m.at, isMe: true, pending: true,
  }));

let onlineListener = false;

/**
 * Tables every page hears about live. Realtime applies RLS, so each person only gets rows they can read (a delete
 * carries just the row's id). Chat, the board and notifications have their own filtered channels below.
 */
const LIVE_TABLES = [
  "users", "courses", "course_enrollments", "teams", "team_members", "tasks", "files", "task_comments",
  "task_checklist_items", "course_announcements", "course_milestones", "team_milestones", "submissions",
  "peer_reviews", "team_summaries", "standups", "standup_summaries", "rubric_criteria", "team_grades", "student_grade_factors", "conflict_alerts", "task_suggestions", "falling_behind", "repo_activity", "team_charters", "charter_agreements", "office_hours", "deadline_extensions", "help_questions", "help_answers", "rubric_checks", "team_retros",
] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];
const TEAM_TABLES: LiveTable[] = ["courses", "course_enrollments", "teams", "team_members", "tasks"]; // team cards show task progress

// Realtime channels: one for the selected team (chat + board), one for the user (notifications and live tables).
// Names are unique per subscription: supabase.channel(name) returns an existing channel with the same
// name, and adding listeners to an already-subscribed channel throws.
let teamChannel: RealtimeChannel | null = null;
let userChannel: RealtimeChannel | null = null;
const channelName = (base: string) => `${base}-${crypto.randomUUID()}`;
let bootRun: Promise<void> | null = null; // StrictMode mounts twice; boot once
let bootedFor: string | null = null; // the user whose channels are open
let seededFor: string | null = null; // the user whose server data the store started from

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
  unreadNotifCount: 0, atRiskCount: 0,
  loaded: { teams: false, tasks: false, files: false, notifications: false, conflicts: false },
  uploading: false,
  commandOpen: false,
  avatars: {},
  live: {},
};

const baseStore = create<AppState>((set, get) => ({
  ...empty,
  setCommandOpen: (open) => set({ commandOpen: open }),

  // Opens the live channels and loads everything for a signed-in session. The profile, and usually the first data,
  // come from the server layout (AppStoreSnapshot); they're loaded again once the channel listens, so nothing is missed.
  boot: (user) => (bootRun ??= (async () => {
    if (bootedFor === user.id) return;
    bootedFor = user.id;
    closeChannels();
    if (get().currentUser?.id !== user.id) set({ ...empty, currentUser: user, avatars: user.avatarPath ? { [user.id]: avatarUrl(user.avatarPath) } : {} });
    // Load the session token first, or the channel joins as anon and RLS hides every row from it.
    const sb = supabaseBrowser();
    await sb.realtime.setAuth().catch((err) => console.error("Realtime auth failed:", err));
    const channel = sb
      .channel(channelName(`user-${user.id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          get().fetchNotifications();
          // "AI suggested a task" arrives as a notification: refresh the suggestions it refers to.
          const team = get().selectedTeam;
          if (team && user.role === "student") get().fetchSuggestions(team.id);
        });
    // One change often touches several rows (a new team and its members): refresh once per burst.
    const pending = new Set<LiveTable>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const tables = [...pending];
      pending.clear();
      set((s) => ({ live: { ...s.live, ...Object.fromEntries(tables.map((t) => [t, (s.live[t] ?? 0) + 1])) } }));
      const team = get().selectedTeam;
      if (tables.includes("users")) get().fetchAvatars();
      if (tables.some((t) => TEAM_TABLES.includes(t))) get().fetchTeams();
      if (team && tables.includes("files")) get().fetchFiles(team.id);
      if (team && tables.includes("task_suggestions") && user.role === "student") get().fetchSuggestions(team.id);
      if (tables.includes("conflict_alerts") && user.role === "instructor") get().fetchConflicts();
      if (tables.includes("falling_behind") && user.role === "instructor") get().fetchAtRiskCount();
    };
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        pending.add(table);
        timer ??= setTimeout(flush, 250);
      });
    }
    userChannel = channel.subscribe();
    const selected = get().selectedTeam; // from the server data: open its channel and load its board
    if (selected && !teamChannel) get().setSelectedTeam(selected);
    await Promise.all([get().fetchTeams(), get().fetchNotifications(), user.role === "instructor" ? get().fetchConflicts() : null,
      user.role === "instructor" ? get().fetchAtRiskCount() : null, get().fetchAvatars()]);
    if (!onlineListener) {
      onlineListener = true;
      // Back online: send what was typed offline, then reload what may have changed meanwhile.
      window.addEventListener("online", () => {
        get().sendQueued();
        get().fetchTeams();
        get().fetchNotifications();
        const team = get().selectedTeam;
        if (team) { get().fetchTasks(team.id); get().fetchFiles(team.id); }
      });
    }
    get().sendQueued();
  })().finally(() => { bootRun = null; })),

  sendQueued: async () => {
    const user = get().currentUser;
    if (!user || !outbox(user.id).length || !navigator.onLine) return;
    const { teams, refused } = await flushOutbox(user.id, (m) => actions.sendMessage(m.teamId, m.content, undefined, m.replyTo));
    for (const m of refused) toast.error(t("A message you wrote offline couldn't be sent"), { description: m.content.slice(0, 200), duration: Infinity });
    for (const id of new Set([...teams, ...refused.map((m) => m.teamId)])) await get().fetchChatMessages(id);
    if (teams.length) toast.success(t("Messages you wrote offline were sent"));
  },

  logout: async () => {
    await supabaseBrowser().auth.signOut();
    await clearOffline();
    Sentry.setUser(null);
    closeChannels();
    bootedFor = seededFor = null;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `team_id=eq.${team.id}` },
        () => get().fetchChatMessages(team.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `team_id=eq.${team.id}` },
        () => get().fetchTasks(team.id)) // team progress refreshes through the live tables
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "focus_sessions", filter: `team_id=eq.${team.id}` },
        () => get().fetchTasks(team.id)) // the focus total on each task
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_dependencies", filter: `team_id=eq.${team.id}` },
        () => get().fetchTasks(team.id))
      // Deletes can't be filtered (they carry only the key), so any team's unlink reloads the board: cheap and rare.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "task_dependencies" }, () => get().fetchTasks(team.id))
      .subscribe();
  },

  fetchTeams: async () => {
    try {
      const teams = await withSnapshot(get().currentUser?.id, "teams", actions.getTeams);
      const selected = get().selectedTeam;
      const still = teams.find((t) => t.id === selected?.id);
      set((s) => ({ teams, selectedTeam: still ?? selected, loaded: { ...s.loaded, teams: true } }));
      // No team yet, or the selected one is gone (deleted, or I was moved out of it): pick another.
      if (!still && (teams.length > 0 || selected)) get().setSelectedTeam(teams[0] ?? null);
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, teams: true } }));
      loadFail(t("load teams"), err);
    }
  },

  fetchChatMessages: async (teamId) => {
    try {
      const user = get().currentUser;
      // The offline copy keeps the latest 100 messages per team.
      const messages = await withSnapshot(user?.id, `messages:${teamId}`, () => actions.getMessages(teamId), (m) => m.slice(-100));
      const mine = messages.map((m) => ({ ...m, isMe: m.senderId === user?.id }));
      set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: [...mine, ...(user ? pendingFor(outbox(user.id), teamId, user) : [])] } }));
    } catch (err) {
      set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: s.chatMessages[teamId] ?? [] } }));
      loadFail(t("load messages"), err);
    }
  },

  fetchTasks: async (teamId) => {
    try {
      const kanbanTasks = await withSnapshot(get().currentUser?.id, `tasks:${teamId}`, () => actions.getTasks(teamId));
      if (get().selectedTeam?.id === teamId) set((s) => ({ kanbanTasks, loaded: { ...s.loaded, tasks: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, tasks: true } }));
      loadFail(t("load tasks"), err);
    }
  },

  fetchNotifications: async () => {
    try {
      const notifications = await withSnapshot(get().currentUser?.id, "notifications", actions.getNotifications);
      set((s) => ({ notifications, unreadNotifCount: notifications.filter((n) => !n.read).length, loaded: { ...s.loaded, notifications: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, notifications: true } }));
      loadFail(t("load notifications"), err);
    }
  },

  fetchFiles: async (teamId) => {
    try {
      const files = await withSnapshot(get().currentUser?.id, `files:${teamId}`, () => actions.getFiles(teamId));
      if (get().selectedTeam?.id === teamId) set((s) => ({ files, loaded: { ...s.loaded, files: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, files: true } }));
      loadFail(t("load files"), err);
    }
  },

  fetchConflicts: async () => {
    try {
      const conflictAlerts = await actions.getConflicts();
      set((s) => ({ conflictAlerts, loaded: { ...s.loaded, conflicts: true } }));
    } catch (err) {
      set((s) => ({ loaded: { ...s.loaded, conflicts: true } }));
      loadFail(t("load conflict alerts"), err);
    }
  },

  fetchAtRiskCount: async () => {
    try {
      set({ atRiskCount: await withSnapshot(get().currentUser?.id, "at-risk-count", actions.countAtRisk) });
    } catch (err) {
      console.error("Failed to count at-risk students:", err); // a badge: no toast
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
  sendMessage: async (teamId, content, fileId, replyTo) => {
    const user = get().currentUser;
    try {
      await actions.sendMessage(teamId, content, fileId, replyTo);
      await get().fetchChatMessages(teamId);
      return true;
    } catch (err) {
      // Offline: queue text messages (files need the connection to upload) and show them as waiting.
      if (isOffline(err) && user && !fileId) {
        const q = queueMessage(user.id, { teamId, content, replyTo });
        set((s) => ({ chatMessages: { ...s.chatMessages, [teamId]: [...(s.chatMessages[teamId] ?? []), ...pendingFor([q], teamId, user)] } }));
        toast.info(t("You're offline"), { description: t("Your message will be sent when you're back online.") });
        return true;
      }
      fail(t("send the message"), err);
      return false;
    }
  },

  toggleReaction: async (teamId, messageId, emoji) => {
    try {
      await actions.toggleReaction(messageId, emoji);
      await get().fetchChatMessages(teamId);
    } catch (err) {
      fail(t("react to the message"), err);
    }
  },

  createTask: async (teamId, data) => {
    try {
      await actions.createTask(teamId, data);
      await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
      return true;
    } catch (err) {
      fail(t("create the task"), err);
      return false;
    }
  },

  updateTask: async (taskId, data) => {
    // Optimistic: move the card now, then reload the board from the server.
    set((s) => ({ kanbanTasks: s.kanbanTasks.map((t) => (t.id === taskId ? { ...t, ...data } : t)) }));
    try {
      await actions.updateTask(taskId, data);
    } catch (err) {
      fail(t("update the task"), err);
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
      fail(t("delete the task"), err);
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
      fail(t("update the notification"), err);
      await get().fetchNotifications();
    }
  },

  markAllNotificationsRead: async () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadNotifCount: 0 }));
    try {
      await actions.markAllNotificationsRead();
    } catch (err) {
      fail(t("update notifications"), err);
      await get().fetchNotifications();
    }
  },

  // Files: bytes go straight to Storage (checked by storage RLS), then a Server Action records the row.
  uploadFile: async (teamId, file) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("File is too large"), { description: t("{name} is over 50 MB.", { name: file.name }) });
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
      fail(t("upload the file"), err);
      return null;
    } finally {
      set({ uploading: false });
    }
  },

  deleteFile: async (teamId, fileId) => {
    try {
      await actions.deleteFile(fileId);
      await Promise.all([get().fetchFiles(teamId), get().fetchChatMessages(teamId)]);
      return true;
    } catch (err) {
      fail(t("delete the file"), err);
      return false;
    }
  },

  downloadFile: async (storagePath) => {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(storagePath, 60, { download: true });
    if (error || !data) return fail(t("download the file"), error);
    window.location.assign(data.signedUrl);
  },

  submitPeerReview: async (teamId, targetId, overallRating, feedback, categoryRatings) => {
    try {
      await actions.submitPeerReview(teamId, targetId, overallRating, feedback, categoryRatings);
      return true;
    } catch (err) {
      const duplicate = err instanceof Error && /duplicate|unique/i.test(err.message);
      if (duplicate) toast.error(t("Already reviewed"), { description: t("You have already reviewed this teammate.") });
      else fail(t("submit the review"), err);
      return false;
    }
  },

  updateProfile: async (data) => {
    try {
      await actions.updateProfile(data);
      set({ currentUser: await actions.getProfile() });
      return true;
    } catch (err) {
      fail(t("save your profile"), err);
      return false;
    }
  },

  // shortcut: loaded once per session, so a teammate's new photo shows after a reload; add a Realtime listener on users if that matters.
  fetchAvatars: async () => {
    try {
      const paths = await actions.getAvatars();
      set({ avatars: Object.fromEntries(Object.entries(paths).map(([id, path]) => [id, avatarUrl(path)])) });
    } catch (err) {
      console.error("Failed to load profile photos:", err); // initials still show
    }
  },

  setAvatar: async (file) => {
    const me = get().currentUser;
    if (!me) return false;
    if (file && !AVATAR_TYPES.includes(file.type)) { toast.error(t("Use a PNG, JPG, WebP or GIF image")); return false; }
    if (file && file.size > MAX_AVATAR_BYTES) { toast.error(t("Photo is too large"), { description: t("Choose an image under 2 MB.") }); return false; }
    const sb = supabaseBrowser().storage.from("avatars");
    const path = file ? `${me.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}` : null;
    try {
      if (file && path) {
        const { error } = await sb.upload(path, file, { contentType: file.type, cacheControl: "31536000" });
        if (error) throw error;
      }
      let old: string | null;
      try {
        old = await actions.setAvatar(path);
      } catch (err) {
        if (path) await sb.remove([path]); // don't leave an orphaned object behind
        throw err;
      }
      if (old) await sb.remove([old]); // best effort: an old file left behind is only wasted space
      set((s) => {
        const avatars = { ...s.avatars };
        if (path) avatars[me.id] = avatarUrl(path); else delete avatars[me.id];
        return { avatars, currentUser: { ...me, avatarPath: path } };
      });
      return true;
    } catch (err) {
      fail(file ? t("update your photo") : t("remove your photo"), err);
      return false;
    }
  },

  resolveConflict: async (id) => {
    try {
      await actions.resolveConflict(id);
      await get().fetchConflicts();
    } catch (err) {
      fail(t("resolve the alert"), err);
    }
  },

  acceptSuggestion: async (id) => {
    try {
      await actions.acceptSuggestion(id);
      set((s) => ({ taskSuggestions: s.taskSuggestions.filter((t) => t.id !== id) }));
      const teamId = get().selectedTeam?.id;
      if (teamId) await Promise.all([get().fetchTasks(teamId), get().fetchTeams()]);
    } catch (err) {
      fail(t("add the task"), err);
    }
  },

  dismissSuggestion: async (id) => {
    try {
      await actions.dismissSuggestion(id);
      set((s) => ({ taskSuggestions: s.taskSuggestions.filter((t) => t.id !== id) }));
    } catch (err) {
      fail(t("dismiss the suggestion"), err);
    }
  },
}));


/** What the server layout loads for the signed-in app; missing parts load in the browser as before. */
export interface InitialData {
  teams?: Team[];
  notifications?: Notification[];
  avatarPaths?: Record<string, string>;
  conflictAlerts?: ConflictAlert[];
  atRiskCount?: number;
}

function seed(user: UserProfile, d: InitialData): Partial<AppState> {
  const out: Partial<AppState> = { currentUser: user, loaded: { ...empty.loaded } };
  if (d.teams) Object.assign(out, { teams: d.teams, selectedTeam: d.teams[0] ?? null, loaded: { ...out.loaded!, teams: true } });
  if (d.notifications) Object.assign(out, { notifications: d.notifications, unreadNotifCount: d.notifications.filter((n) => !n.read).length, loaded: { ...out.loaded!, notifications: true } });
  if (d.conflictAlerts) Object.assign(out, { conflictAlerts: d.conflictAlerts, loaded: { ...out.loaded!, conflicts: true } });
  if (d.atRiskCount != null) out.atRiskCount = d.atRiskCount;
  out.avatars = Object.fromEntries(Object.entries(d.avatarPaths ?? (user.avatarPath ? { [user.id]: user.avatarPath } : {})).map(([id, p]) => [id, avatarUrl(p)]));
  return out;
}

const ServerSnapshot = React.createContext<AppState | null>(null);

/** Starts the browser store from the server's data, once per user. Runs during render on purpose: before anything
 *  reads the store, so the first render after hydration already has the data. Idempotent. */
function seedStore(userId: string, state: AppState) {
  if (seededFor === userId || bootedFor === userId) return;
  seededFor = userId;
  baseStore.setState(state);
}

/**
 * Renders the app with the server layout's data: while server rendering and hydrating, useAppStore reads this
 * per-request snapshot (never the shared store), and in the browser the store starts from the same objects, so the
 * page shows data from its first paint and hydration matches.
 */
export function AppStoreSnapshot({ user, data, children }: { user: UserProfile; data: InitialData; children: React.ReactNode }) {
  const state = React.useMemo(() => ({ ...baseStore.getInitialState(), ...seed(user, data) }), [user, data]);
  if (typeof window !== "undefined") seedStore(user.id, state);
  return React.createElement(ServerSnapshot.Provider, { value: state }, children);
}

/** The app store as a hook, `useAppStore((s) => s.teams)`, plus getState/setState/subscribe for code outside React. */
export const useAppStore = Object.assign(
  function useAppStore<T>(selector: (s: AppState) => T): T {
    const server = React.useContext(ServerSnapshot);
    return React.useSyncExternalStore(baseStore.subscribe, () => selector(baseStore.getState()), () => selector(server ?? baseStore.getInitialState()));
  },
  { getState: baseStore.getState, setState: baseStore.setState, subscribe: baseStore.subscribe, getInitialState: baseStore.getInitialState },
);

/** A number that changes whenever any of these tables changes anywhere; add it to a reload effect's dependencies. */
export const useLive = (...tables: LiveTable[]) => useAppStore((s) => tables.reduce((n, t) => n + (s.live[t] ?? 0), 0));
