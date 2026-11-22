import { getMyWeek } from "@/app/actions";
import { AuthError } from "@/db";
import { buildIcs } from "@/lib/ics";
import { translate } from "@/lib/i18n";
import { requestLocale } from "@/lib/locale-server";

// Downloads the signed-in student's due dates and booked office hours (My week) as an .ics file for Google Calendar, Outlook or Apple Calendar.
export async function GET(req: Request) {
  try {
    const base = new URL(req.url).origin;
    const items = await getMyWeek();
    const L = await requestLocale();
    const ics = buildIcs(items.map((i) => i.kind === "office-hours"
      // Same UID as the single-slot download, so a calendar that has both keeps one event.
      ? { uid: `office-hours-${i.id}`, start: i.startsAt!, minutes: i.minutes!, location: i.location || undefined, title: `${i.title} · ${i.courseCode}`,
          description: `${i.teamName} · ${i.courseCode}`, url: `${base}/student/courses/${i.courseId}` }
      : {
          uid: `${i.kind}-${i.id}-${i.teamId}`,
          date: i.date,
          title: i.kind === "milestone" ? translate(L, "Milestone: {title}", { title: i.title }) : translate(L, "Due: {title}", { title: i.title }),
          description: `${i.teamName} · ${i.courseCode}`,
          url: base + (i.kind === "task" ? `/student?team=${i.teamId}&task=${i.id}` : `/student/courses/${i.courseId}`),
        }));
    return new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="scholarsync.ics"', "cache-control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof AuthError) return new Response("Sign in first", { status: 401 });
    throw err;
  }
}
