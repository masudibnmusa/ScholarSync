import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { sendNotification, setVapidDetails, type WebPushError } from "web-push";
import { adminDb as db } from "@/db";
import { notifications, pushSubscriptions, users } from "@/db/schema";
import { notificationHref } from "@/components/app/nav";
import { translateNotice } from "@/lib/i18n/notices";

const FRESH_MS = 60 * 60 * 1000; // older than this when the job sees it: too late to buzz a phone

/** What buzzes a phone: everything except routine chat messages (an @mention still does). */
const pushworthy = (n: { type: string; title: string }) => n.type !== "message" || n.title.endsWith(" mentioned you");

/**
 * Sends new notifications to every browser their owner turned alerts on in. Claims the batch first (pushed_at), so an
 * overlapping run never sends twice. Subscriptions the push service says are gone (404/410) are deleted.
 */
export async function sendPendingPushes(): Promise<{ claimed: number; sent: number; removed: number }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { claimed: 0, sent: 0, removed: 0 };
  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@scholarsync.local", publicKey, privateKey);

  const batch = await db.update(notifications).set({ pushedAt: sql`now()` })
    .where(sql`${notifications.id} in (select id from public.notifications where pushed_at is null order by created_at limit 500 for update skip locked)`)
    .returning({ id: notifications.id, userId: notifications.userId, type: notifications.type, title: notifications.title, body: notifications.body, link: notifications.link, createdAt: notifications.createdAt });
  const due = batch.filter((n) => pushworthy(n) && Date.now() - new Date(n.createdAt).getTime() < FRESH_MS);
  if (!due.length) return { claimed: batch.length, sent: 0, removed: 0 };

  const userIds = [...new Set(due.map((n) => n.userId))];
  const subs = await db.select({ s: pushSubscriptions, role: users.role, locale: users.locale }).from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(inArray(pushSubscriptions.userId, userIds));

  let sent = 0;
  const gone = new Set<string>();
  await Promise.all(due.flatMap((n) => subs.filter((x) => x.s.userId === n.userId).map(async ({ s, role, locale }) => {
    const payload = JSON.stringify({ title: translateNotice(locale, n.title), body: translateNotice(locale, n.body), url: notificationHref(n.type, role, n.link), tag: n.id });
    try {
      await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (err) {
      const status = (err as WebPushError).statusCode;
      if (status === 404 || status === 410) gone.add(s.endpoint);
      else console.error("Push failed:", status, (err as Error).message);
    }
  })));
  if (gone.size) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, [...gone]));
  return { claimed: batch.length, sent, removed: gone.size };
}
