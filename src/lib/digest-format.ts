// Builds the daily digest email. Pure, so it can be checked without a server: node src/lib/digest-format.check.mjs

import { translate, type Locale } from "./i18n/index.ts";
import { translateNotice } from "./i18n/notices.ts";

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
