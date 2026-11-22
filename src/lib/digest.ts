import "server-only";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { notifications, users } from "@/db/schema";
import { notificationHref } from "@/components/app/nav";
import { buildDigest } from "@/lib/digest-format";
import { sendEmail } from "@/lib/email";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MAX_ITEMS = 20;

/**
 * Emails one user their unread notifications from the last 24 hours that were not emailed yet.
 * The daily job marks them emailed; a sample (from the profile page) leaves them as they are.
 */
export async function sendDigestTo(userId: string, { sample = false } = {}): Promise<number> {
  const [u] = await db.select({ name: users.name, email: users.email, role: users.role, on: users.emailDigest, locale: users.locale }).from(users).where(eq(users.id, userId));
  if (!u || (!sample && !u.on)) return 0;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.emailedAt), gt(notifications.createdAt, since)))
    .orderBy(notifications.createdAt).limit(MAX_ITEMS);
  if (!rows.length) return 0;

  const base = appUrl();
  const items = rows.map((n) => ({ title: n.title, body: n.body, href: base + notificationHref(n.type, u.role, n.link) }));
  const sent = await sendEmail({ to: u.email, ...buildDigest(u.name, items, `${base}/${u.role}/profile`, u.locale) });
  if (!sent) return 0;
  if (!sample) await db.update(notifications).set({ emailedAt: new Date().toISOString() }).where(inArray(notifications.id, rows.map((n) => n.id)));
  return rows.length;
}

/** Everyone with the digest on and something new to read. */
export async function digestRecipients(): Promise<string[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await db.selectDistinct({ id: users.id }).from(users)
    .innerJoin(notifications, eq(notifications.userId, users.id))
    .where(and(eq(users.emailDigest, true), isNull(notifications.readAt), isNull(notifications.emailedAt), gt(notifications.createdAt, since)));
  return rows.map((r) => r.id);
}
