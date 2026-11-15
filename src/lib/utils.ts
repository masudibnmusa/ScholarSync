import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

// "Md Nazmul Hasan" → "Nazmul": a leading title or abbreviation is not what people are called.
const TITLES = new Set(["md", "md.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "dr", "dr.", "prof", "prof."]);
export function firstName(name: string | undefined | null) {
  const parts = name?.trim().split(/\s+/) ?? [];
  return (parts.length > 1 && TITLES.has(parts[0].toLowerCase()) ? parts[1] : parts[0]) ?? "";
}

// Avatar colours: fixed pairs (not random) so one person always gets the same colour. All pass AA with white text.
const AVATAR_COLORS = ["#0f766e", "#c2410c", "#0369a1", "#6d28d9", "#a16207", "#be123c", "#047857", "#4338ca", "#9d174d", "#0e7490", "#7e22ce", "#4d7c0f", "#1d4ed8"];
export function avatarColor(seed: string) {
  // FNV-1a, then fold the high bits in: the low bits alone put similar names on the same colour.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return AVATAR_COLORS[((h ^ (h >>> 15)) >>> 0) % AVATAR_COLORS.length];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Due dates are plain dates ("2026-11-20"); compare in local time so "today" is the user's today. */
export function dueInfo(date: string | null): { label: string; tone: "muted" | "warning" | "danger" } | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const days = Math.round((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const short = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return { label: `Overdue · ${short}`, tone: "danger" };
  if (days === 0) return { label: "Due today", tone: "warning" };
  if (days === 1) return { label: "Due tomorrow", tone: "warning" };
  if (days <= 3) return { label: `Due in ${days} days`, tone: "warning" };
  return { label: short, tone: "muted" };
}

export function healthInfo(score: number): { label: string; tone: "success" | "warning" | "danger" } {
  if (score >= 75) return { label: "Healthy", tone: "success" };
  if (score >= 50) return { label: "Needs attention", tone: "warning" };
  return { label: "At risk", tone: "danger" };
}

export const toneText = { success: "text-success", warning: "text-warning", danger: "text-destructive", muted: "text-muted-foreground" } as const;
export const toneVar = { success: "var(--success)", warning: "var(--warning)", danger: "var(--destructive)" } as const;
