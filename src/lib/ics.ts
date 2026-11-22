// iCalendar (RFC 5545) export of due dates (all-day) and booked office hours (timed, in UTC). Pure: node src/lib/ics.check.mjs

type Base = { uid: string; title: string; description: string; url: string; location?: string };
/** `date` (YYYY-MM-DD) for an all-day event, or `start` (an ISO instant) and `minutes` for a timed one. */
export type IcsEvent = Base & ({ date: string } | { start: string; minutes: number });

// Commas, semicolons, backslashes and newlines must be escaped in TEXT values.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines over 75 octets are folded: CRLF then a space. Fold by bytes so multi-byte text stays valid.
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const day = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

/** One VEVENT per event. `now` is the DTSTAMP (UTC). */
export function buildIcs(events: IcsEvent[], now = new Date()) {
  const stamp = utc(now);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ScholarSync//My week//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:ScholarSync",
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}@scholarsync`,
      `DTSTAMP:${stamp}`,
      ...("date" in e
        ? [`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(nextDay(e.date))}`]
        : [`DTSTART:${utc(new Date(e.start))}`, `DTEND:${utc(new Date(new Date(e.start).getTime() + e.minutes * 60_000))}`]),
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      `URL:${e.url}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
