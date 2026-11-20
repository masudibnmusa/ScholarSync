// Meeting slots suggested by the AI. Pure, so it can be checked without a server: node src/lib/meeting.check.mjs

export type MeetingSlot = { date: string; start: string; minutes: number; attendees: string[]; note: string };

const DAY_MS = 86_400_000;
export const SLOT_HORIZON_DAYS = 14;

/** A model answer is untrusted: keep real future dates within two weeks, real times and real member names, at most 3. */
export function cleanSlots(raw: MeetingSlot[], members: string[], today: string): MeetingSlot[] {
  const t0 = Date.parse(today + "T00:00:00Z");
  const known = new Set(members);
  const seen = new Set<string>();
  return raw.filter((s) => {
    const d = Date.parse(s.date + "T00:00:00Z");
    const [h, m] = s.start.split(":").map(Number);
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.start) && h < 24 && m < 60
      && d > t0 && d <= t0 + SLOT_HORIZON_DAYS * DAY_MS && !seen.has(s.date + s.start);
    seen.add(s.date + s.start);
    return ok;
  }).slice(0, 3).map((s) => ({
    ...s,
    minutes: Math.min(120, Math.max(15, Math.round(s.minutes / 15) * 15 || 60)),
    attendees: [...new Set(s.attendees.filter((a) => known.has(a)))],
    note: s.note.slice(0, 160),
  }));
}

export function slotLabel(s: Pick<MeetingSlot, "date" | "start" | "minutes">) {
  const day = new Date(s.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const [h, m] = s.start.split(":").map(Number);
  const end = h * 60 + m + s.minutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day}, ${s.start}–${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

/** The chat message that proposes the chosen slot to the team. */
export function proposalMessage(s: MeetingSlot, teamSize: number) {
  const fits = s.attendees.length >= teamSize ? "works for everyone" : `works for ${s.attendees.join(", ")}`;
  return `📅 Meeting proposal: ${slotLabel(s)} (${fits}, based on our availability). Reply here if it doesn't suit you.`;
}
