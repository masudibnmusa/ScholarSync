// Builds the daily digest email. Pure, so it can be checked without a server: node src/lib/digest-format.check.mjs

export type DigestItem = { title: string; body: string; href: string };

/** Notification text comes from users (names, chat), so it is escaped before going into HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildDigest(name: string, items: DigestItem[], settingsUrl: string) {
  const first = name.trim().split(/\s+/)[0] || "there";
  const subject = items.length === 1 ? `ScholarSync: ${items[0].title}` : `ScholarSync: ${items.length} updates for you`;
  const text = [
    `Hi ${first},`,
    "",
    `Here is what happened in ScholarSync since yesterday:`,
    "",
    ...items.map((i) => `- ${i.title}${i.body ? `: ${i.body}` : ""}\n  ${i.href}`),
    "",
    `Turn these emails off in your profile: ${settingsUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f0e6;font-family:system-ui,sans-serif;color:#2e2620">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 4px">Hi ${escapeHtml(first)},</p>
<p style="margin:0 0 20px;color:#6b5d52">Here is what happened in ScholarSync since yesterday.</p>
${items.map((i) => `<a href="${escapeHtml(i.href)}" style="display:block;text-decoration:none;color:inherit;background:#fffbf5;border-radius:16px;padding:14px 16px;margin:0 0 8px">
<strong style="display:block;font-size:15px">${escapeHtml(i.title)}</strong>${i.body ? `<span style="display:block;font-size:13px;color:#6b5d52;margin-top:2px">${escapeHtml(i.body)}</span>` : ""}</a>`).join("\n")}
<p style="margin:24px 0 0;font-size:12px;color:#6b5d52">You get this once a day when something is unread. <a href="${escapeHtml(settingsUrl)}" style="color:#a6482a">Turn it off</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}
