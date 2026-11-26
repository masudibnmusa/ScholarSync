import "server-only";
import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { courses, notifications, officeHours, teamMembers, teams, users } from "@/db/schema";
import { escapeHtml } from "@/lib/digest-format";
import { sendEmail } from "@/lib/email";
import { intlOf, translate } from "@/lib/i18n";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REMIND_MINUTES = 60;

/**
 * About an hour before each booked slot: a notification (which the push job sends to phones) and an email to the team
 * and the instructor, with a link to the calendar file. Each slot is claimed first, so overlapping runs don't both send.
 * A slot whose sending fails is released again and the error thrown, so the job's retry sends it (people already
 * reached that time may get it twice: better than nobody hearing).
 */
export async function sendOfficeHourReminders(): Promise<number> {
  const due = await db.update(officeHours).set({ remindedAt: sql`now()` })
    .where(and(isNotNull(officeHours.teamId), isNull(officeHours.remindedAt), gt(officeHours.startsAt, sql`now()`),
      lte(officeHours.startsAt, sql`now() + make_interval(mins => ${REMIND_MINUTES})`)))
    .returning();
  let failure: unknown;
  for (const slot of due) {
    try {
      await remindSlot(slot);
    } catch (err) {
      failure ??= err;
      await db.update(officeHours).set({ remindedAt: null }).where(eq(officeHours.id, slot.id));
    }
  }
  if (failure) throw failure;
  return due.length;
}

async function remindSlot(slot: typeof officeHours.$inferSelect) {
  const [ctx] = await db.select({ team: teams.name, code: courses.code, instructorId: courses.instructorId })
    .from(teams).innerJoin(courses, eq(courses.id, teams.courseId)).where(eq(teams.id, slot.teamId!));
  if (!ctx) return;
  const people = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, emailOn: users.emailDigest, locale: users.locale }).from(users)
    .where(sql`${users.id} = ${ctx.instructorId} or ${users.id} in (select ${teamMembers.userId} from ${teamMembers} where ${teamMembers.teamId} = ${slot.teamId})`);
  const when = new Date(slot.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: slot.tz });
  const where = slot.location ? ` · ${slot.location}` : "";
  const ics = `${appUrl()}/api/office-hours/${slot.id}`;
  for (const p of people) {
    const link = p.role === "instructor" ? `/instructor/courses/${slot.courseId}` : `/student/courses/${slot.courseId}`;
    const title = p.role === "instructor" ? `Office hours with ${ctx.team} soon` : "Your office hours start soon";
    await db.insert(notifications).values({ userId: p.id, type: "system", title, body: `${when}${where}${slot.topic ? `. Topic: ${slot.topic}` : ""}`, link });
    if (!p.emailOn) continue; // same switch as the digest: no email at all
    // The email is in the recipient's language; the notification row stays English and is translated when shown.
    const t = (text: string, vars?: Record<string, string>) => translate(p.locale, text, vars);
    const localWhen = new Date(slot.startsAt).toLocaleString(intlOf(p.locale) ?? "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: slot.tz });
    const lines = [`${localWhen}${where}`, `${ctx.team} · ${ctx.code}`, ...(slot.topic ? [t("Topic: {topic}", { topic: slot.topic })] : [])];
    const subject = p.role === "instructor" ? t("Office hours with {team} soon", { team: ctx.team }) : t("Your office hours start soon");
    await sendEmail({
      to: p.email,
      subject: `${subject}: ${localWhen}`,
      text: `${t("Hi {name},", { name: p.name })}\n\n${lines.join("\n")}\n\n${t("Open: {url}", { url: appUrl() + link })}\n${t("Add to your calendar: {url}", { url: ics })}\n`,
      html: `<p>${escapeHtml(t("Hi {name},", { name: p.name }))}</p><p>${lines.map(escapeHtml).join("<br>")}</p>`
        + `<p><a href="${appUrl()}${link}">${escapeHtml(t("Open the course"))}</a> · <a href="${ics}">${escapeHtml(t("Add to your calendar"))}</a></p>`,
    });
  }
}
