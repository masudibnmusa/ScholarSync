import { getMyWeek } from "@/app/actions";
import { AuthError } from "@/db";
import { buildIcs } from "@/lib/ics";

// Downloads the signed-in student's due dates (My week) as an .ics file for Google Calendar, Outlook or Apple Calendar.
export async function GET(req: Request) {
  try {
    const base = new URL(req.url).origin;
    const items = await getMyWeek();
    const ics = buildIcs(items.map((i) => ({
      uid: `${i.kind}-${i.id}-${i.teamId}`,
      date: i.date,
      title: i.kind === "milestone" ? `Milestone: ${i.title}` : `Due: ${i.title}`,
      description: `${i.teamName} · ${i.courseCode}`,
      url: base + (i.kind === "task" ? `/student?team=${i.teamId}&task=${i.id}` : `/student/courses/${i.courseId}`),
    })));
    return new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="scholarsync.ics"', "cache-control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof AuthError) return new Response("Sign in first", { status: 401 });
    throw err;
  }
}
