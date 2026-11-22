import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { intl, t } from "./i18n/index.ts";

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
// Earthy tones to sit with the pastel UI; each passes 4.5:1 against white initials.
const AVATAR_COLORS = ["#a6482a", "#57775a", "#4f6f8f", "#8a5a2b", "#7a4e6e", "#3f6f6a", "#9a4f45", "#5d6b3a", "#6a5a8a", "#8a6a2a"];
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
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n}m ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n}h ago", { n: Math.floor(s / 3600) });
  if (s < 604800) return t("{n}d ago", { n: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString(intl(), { month: "short", day: "numeric" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return t("Today");
  if (days === 1) return t("Yesterday");
  return d.toLocaleDateString(intl(), { weekday: "long", month: "short", day: "numeric" });
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(intl(), { hour: "numeric", minute: "2-digit" });

/** Due dates are plain dates ("2026-11-20"); compare in local time so "today" is the user's today. */
export function dueInfo(date: string | null): { label: string; tone: "muted" | "warning" | "danger" } | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const days = Math.round((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const short = due.toLocaleDateString(intl(), { month: "short", day: "numeric" });
  if (days < 0) return { label: t("Overdue · {short}", { short }), tone: "danger" };
  if (days === 0) return { label: t("Due today"), tone: "warning" };
  if (days === 1) return { label: t("Due tomorrow"), tone: "warning" };
  if (days <= 3) return { label: t("Due in {days} days", { days }), tone: "warning" };
  return { label: short, tone: "muted" };
}

export function healthInfo(score: number): { label: string; tone: "success" | "warning" | "danger" } {
  if (score >= 75) return { label: t("Healthy"), tone: "success" };
  if (score >= 50) return { label: t("Needs attention"), tone: "warning" };
  return { label: t("At risk"), tone: "danger" };
}

export const toneText = { success: "text-success", warning: "text-warning", danger: "text-destructive", muted: "text-muted-foreground" } as const;
export const toneVar = { success: "var(--success)", warning: "var(--warning)", danger: "var(--destructive)" } as const;

// ─── @mentions (same rule as public.mentions() in migration 0008) ──────
const nameWords = (name: string) => name.toLowerCase().trim().split(/\s+/).filter((w, i) => i === 0 || w.length >= 3);

/** The handle the mention picker inserts: the first name word of 3+ letters ("Md Nazmul Hasan" → "Nazmul"). */
export function mentionHandle(name: string) {
  const words = name.trim().split(/\s+/);
  return words.find((w) => w.length >= 3) ?? words[0] ?? "";
}

/** Whether "@token" refers to `name`. A trailing full stop ("@Nazmul.") is ignored. */
export function isMentionOf(token: string, name: string) {
  const t = token.toLowerCase();
  const words = nameWords(name);
  return words.includes(t) || words.includes(t.replace(/\.+$/, ""));
}

export const MENTION_RE = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_.]+)/gu;

// ─── CSV export ─────────────────────────────────────────────────────────
/** One CSV cell: quoted when needed, and text a spreadsheet would run as a formula (=, +, -, @) is defused. */
export function csvCell(v: string | number | null | undefined) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows to CSV text (CRLF line ends, as Excel expects). */
export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/** Browser only: saves CSV text as a file. The BOM makes Excel read names as UTF-8. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

/** A same-site path to return to after signing in, or null. Rejects "//host" and "/\\host", which browsers treat as other sites. */
export function safeNext(v: string | string[] | undefined) {
  return typeof v === "string" && /^\/(?![/\\])/.test(v) ? v : null;
}

// ─── My week grouping ───────────────────────────────────────────────────
/** Whole days from `today` to an ISO date (YYYY-MM-DD), both read as local calendar days. */
export function daysUntil(iso: string, today = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 864e5);
}

/** The heading a dated item is listed under: Overdue, Today, Tomorrow, a weekday this week, Next week or Later. */
export function weekBucket(iso: string, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n < 0) return t("Overdue");
  if (n === 0) return t("Today");
  if (n === 1) return t("Tomorrow");
  if (n < 7) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + n).toLocaleDateString(intl(), { weekday: "long" });
  if (n < 14) return t("Next week");
  return t("Later");
}
