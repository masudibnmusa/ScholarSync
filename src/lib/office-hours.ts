import "server-only";
import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { adminDb as db } from "@/db";
import { courses, notifications, officeHours, teamMembers, teams, users } from "@/db/schema";
import { escapeHtml } from "@/lib/digest-format";
import { sendEmail } from "@/lib/email";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REMIND_MINUTES = 60;

/**
 * About an hour before each booked slot: a notification (which the push job sends to phones) and an email to the team
 * and the instructor, with a link to the calendar file. Each slot is claimed first, so a reminder goes out once.
 */
export async function sendOfficeHourReminders(): Promise<number> {
  const due = await db.update(officeHours).set({ remindedAt: sql`now()` })
    .where(and(isNotNull(officeHours.teamId), isNull(officeHours.remindedAt), gt(officeHours.startsAt, sql`now()`),
      lte(officeHours.startsAt, sql`now() + make_interval(mins => ${REMIND_MINUTES})`)))
    .returning();
  for (const slot of due) {
    const [ctx] = await db.select({ team: teams.name, code: courses.code, instructorId: courses.instructorId })
      .from(teams).innerJoin(courses, eq(courses.id, teams.courseId)).where(eq(teams.id, slot.teamId!));
    if (!ctx) continue;
    const people = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, emailOn: users.emailDigest }).from(users)
      .where(sql`${users.id} = ${ctx.instructorId} or ${users.id} in (select ${teamMembers.userId} from ${teamMembers} where ${teamMembers.teamId} = ${slot.teamId})`);
    const when = new Date(slot.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: slot.tz });
    const where = slot.location ? ` · ${slot.location}` : "";
    const ics = `${appUrl()}/api/office-hours/${slot.id}`;
    for (const p of people) {
      const link = p.role === "instructor" ? `/instructor/courses/${slot.courseId}` : `/student/courses/${slot.courseId}`;
      const title = p.role === "instructor" ? `Office hours with ${ctx.team} soon` : "Your office hours start soon";
      await db.insert(notifications).values({ userId: p.id, type: "system", title, body: `${when}${where}${slot.topic ? `. Topic: ${slot.topic}` : ""}`, link });
      if (!p.emailOn) continue; // same switch as the digest: no email at all
      const lines = [`${when}${where}`, `${ctx.team} · ${ctx.code}`, ...(slot.topic ? [`Topic: ${slot.topic}`] : [])];
      await sendEmail({
        to: p.email,
        subject: `${title}: ${when}`,
        text: `Hi ${p.name},\n\n${lines.join("\n")}\n\nOpen: ${appUrl()}${link}\nAdd to your calendar: ${ics}\n`,
        html: `<p>Hi ${escapeHtml(p.name)},</p><p>${lines.map(escapeHtml).join("<br>")}</p>`
          + `<p><a href="${appUrl()}${link}">Open the course</a> · <a href="${ics}">Add to your calendar</a></p>`,
      });
    }
  }
  return due.length;
}
