import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AuthError, withUser } from "@/db";
import { courses, officeHours, teams } from "@/db/schema";
import { buildIcs } from "@/lib/ics";
import { translate } from "@/lib/i18n";
import { requestLocale } from "@/lib/locale-server";

// One office-hours slot as an .ics file, for anyone who can see it (RLS: the instructor and enrolled students).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  try {
    const [row] = await withUser((tx) => tx.select({ o: officeHours, code: courses.code, team: teams.name }).from(officeHours)
      .innerJoin(courses, eq(courses.id, officeHours.courseId)).leftJoin(teams, and(eq(teams.id, officeHours.teamId)))
      .where(eq(officeHours.id, id.data)));
    if (!row) return new Response("Not found", { status: 404 });
    const base = new URL(req.url).origin;
    const L = await requestLocale();
    const ics = buildIcs([{
      uid: `office-hours-${row.o.id}`, start: row.o.startsAt, minutes: row.o.minutes, location: row.o.location || undefined,
      title: translate(L, "Office hours · {code}", { code: row.code }), description: row.o.topic ? translate(L, "Topic: {topic}", { topic: row.o.topic }) : "",
      url: `${base}/student/courses/${row.o.courseId}`,
    }]);
    return new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="office-hours-${row.code}.ics"`, "cache-control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof AuthError) return new Response("Sign in first", { status: 401 });
    throw err;
  }
}
