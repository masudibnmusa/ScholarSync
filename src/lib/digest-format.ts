// Builds the daily digest email. Pure, so it can be checked without a server: node src/lib/digest-format.check.mjs

import { translate, type Locale } from "./i18n/index.ts";
import { translateNotice, translateReason } from "./i18n/notices.ts";

export type DigestItem = { title: string; body: string; href: string };

/** Notification text comes from users (names, chat), so it is escaped before going into HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The digest in the recipient's language (their profile setting); notification text is translated like in the app. */
export function buildDigest(name: string, raw: DigestItem[], settingsUrl: string, locale: Locale = "en") {
  const t = (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars);
  const items = raw.map((i) => ({ ...i, title: translateNotice(locale, i.title), body: translateNotice(locale, i.body) }));
  const first = name.trim().split(/\s+/)[0] || t("there");
  const subject = items.length === 1 ? `ScholarSync: ${items[0].title}` : t("ScholarSync: {n} updates for you", { n: items.length });
  const text = [
    t("Hi {name},", { name: first }),
    "",
    t("Here is what happened in ScholarSync since yesterday:"),
    "",
    ...items.map((i) => `- ${i.title}${i.body ? `: ${i.body}` : ""}\n  ${i.href}`),
    "",
    t("Turn these emails off in your profile: {url}", { url: settingsUrl }),
  ].join("\n");
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f7f0e6;font-family:system-ui,sans-serif;color:#2e2620">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 4px">${escapeHtml(t("Hi {name},", { name: first }))}</p>
<p style="margin:0 0 20px;color:#6b5d52">${escapeHtml(t("Here is what happened in ScholarSync since yesterday."))}</p>
${items.map((i) => `<a href="${escapeHtml(i.href)}" style="display:block;text-decoration:none;color:inherit;background:#fffbf5;border-radius:16px;padding:14px 16px;margin:0 0 8px">
<strong style="display:block;font-size:15px">${escapeHtml(i.title)}</strong>${i.body ? `<span style="display:block;font-size:13px;color:#6b5d52;margin-top:2px">${escapeHtml(i.body)}</span>` : ""}</a>`).join("\n")}
<p style="margin:24px 0 0;font-size:12px;color:#6b5d52">${escapeHtml(t("You get this once a day when something is unread."))} <a href="${escapeHtml(settingsUrl)}" style="color:#a6482a">${escapeHtml(t("Turn it off"))}</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}

/** What an instructor should look at this week, per course they teach (live courses only). */
export interface WeeklyData {
  risk: { student: string; team: string; course: string; reasons: string[]; href: string }[];
  conflicts: { team: string; course: string; summary: string; href: string }[];
  extensions: { team: string; course: string; milestone: string; until: string; href: string }[];
  missing: { team: string; course: string; milestone: string; due: string; href: string }[];
}

export const weeklyCount = (d: WeeklyData) => d.risk.length + d.conflicts.length + d.extensions.length + d.missing.length;

/** The Monday summary for an instructor, in their language. Empty sections are left out; names and text are escaped. */
export function buildInstructorDigest(name: string, d: WeeklyData, settingsUrl: string, locale: Locale = "en") {
  const t = (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const first = name.trim().split(/\s+/)[0] || t("there");
  const count = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en").format(n);
  const sections = [
    { title: t("Students falling behind"), items: d.risk.map((x) => ({ title: `${x.student} · ${x.team} (${x.course})`, body: x.reasons.map((r) => translateReason(locale, r)).join(", "), href: x.href })) },
    { title: t("Open conflicts"), items: d.conflicts.map((x) => ({ title: `${x.team} (${x.course})`, body: x.summary, href: x.href })) },
    { title: t("Requests for more time"), items: d.extensions.map((x) => ({ title: `${x.team} (${x.course})`, body: t("{milestone}, until {date}", { milestone: x.milestone, date: day(x.until) }), href: x.href })) },
    { title: t("Missing hand-ins"), items: d.missing.map((x) => ({ title: `${x.team} (${x.course})`, body: t("{milestone}, due {date}", { milestone: x.milestone, date: day(x.due) }), href: x.href })) },
  ].filter((sec) => sec.items.length);
  const n = weeklyCount(d);
  const subject = t("ScholarSync: your week, {n} things to look at", { n });
  const text = [
    t("Hi {name},", { name: first }),
    "",
    t("Here is what needs you in your courses this week:"),
    ...sections.flatMap((sec) => ["", `${sec.title} (${count(sec.items.length)})`, ...sec.items.map((i) => `- ${i.title}${i.body ? `: ${i.body}` : ""}\n  ${i.href}`)]),
    "",
    t("Turn these emails off in your profile: {url}", { url: settingsUrl }),
  ].join("\n");
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f7f0e6;font-family:system-ui,sans-serif;color:#2e2620">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 4px">${escapeHtml(t("Hi {name},", { name: first }))}</p>
<p style="margin:0 0 20px;color:#6b5d52">${escapeHtml(t("Here is what needs you in your courses this week."))}</p>
${sections.map((sec) => `<h2 style="font-size:14px;margin:20px 0 8px">${escapeHtml(sec.title)} (${count(sec.items.length)})</h2>
${sec.items.map((i) => `<a href="${escapeHtml(i.href)}" style="display:block;text-decoration:none;color:inherit;background:#fffbf5;border-radius:16px;padding:14px 16px;margin:0 0 8px">
<strong style="display:block;font-size:15px">${escapeHtml(i.title)}</strong>${i.body ? `<span style="display:block;font-size:13px;color:#6b5d52;margin-top:2px">${escapeHtml(i.body)}</span>` : ""}</a>`).join("\n")}`).join("\n")}
<p style="margin:24px 0 0;font-size:12px;color:#6b5d52">${escapeHtml(t("You get this on Mondays when something in your courses needs you."))} <a href="${escapeHtml(settingsUrl)}" style="color:#a6482a">${escapeHtml(t("Turn it off"))}</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}
