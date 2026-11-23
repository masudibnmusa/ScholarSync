// Notifications are written in English by SQL triggers and jobs (one row serves every reader), so they are translated
// when shown: each stored sentence is matched back to its template, and the template is translated with the same
// names, titles and dates filled in. Unknown text is shown as written.
import { translate, type Locale } from "./index.ts";

// Order matters: the first full match wins, so specific templates come before general ones.
const TEMPLATES: [RegExp, string][] = [
  // Titles
  [/^New message from (?<name>.+)$/, "New message from {name}"],
  [/^(?<name>.+) mentioned you$/, "{name} mentioned you"],
  [/^AI suggested a task$/, "AI suggested a task"],
  [/^Due tomorrow: (?<title>.+)$/, "Due tomorrow: {title}"],
  [/^(?<name>.+) commented on (?<title>.+)$/, "{name} commented on {title}"],
  [/^New milestone: (?<title>.+)$/, "New milestone: {title}"],
  [/^Grades released for (?<code>.+)$/, "Grades released for {code}"],
  [/^(?<team>.+) missed a milestone: (?<title>.+)$/, "{team} missed a milestone: {title}"],
  [/^(?<team>.+) has (?<n>\d+) overdue tasks$/, "{team} has {n} overdue tasks"],
  [/^Feedback on (?<title>.+)$/, "Feedback on {title}"],
  [/^A quick check-in on (?<team>.+)$/, "A quick check-in on {team}"],
  [/^(?<name>.+) may be falling behind in (?<team>.+)$/, "{name} may be falling behind in {team}"],
  [/^(?<name>.+) wrote your team charter$/, "{name} wrote your team charter"],
  [/^(?<name>.+) changed your team charter$/, "{name} changed your team charter"],
  [/^Your office hours booking was cancelled$/, "Your office hours booking was cancelled"],
  [/^Office hours you booked were removed$/, "Office hours you booked were removed"],
  [/^(?<team>.+) replied in chat$/, "{team} replied in chat"],
  [/^(?<team>.+) booked office hours$/, "{team} booked office hours"],
  [/^(?<team>.+) cancelled office hours$/, "{team} cancelled office hours"],
  [/^Office hours with (?<team>.+) soon$/, "Office hours with {team} soon"],
  [/^Your office hours start soon$/, "Your office hours start soon"],
  [/^New task assigned$/, "New task assigned"],
  [/^You received a peer review$/, "You received a peer review"],
  [/^Conflict alert: (?<team>.+)$/, "Conflict alert: {team}"],
  [/^(?<team>.+) stand-up: (?<n>\d+) blocked$/, "{team} stand-up: {n} blocked"],
  [/^(?<team>.+) stand-up summary$/, "{team} stand-up summary"],
  [/^Weekly recap for (?<team>.+)$/, "Weekly recap for {team}"],
  [/^Weekly stand-up for (?<team>.+)$/, "Weekly stand-up for {team}"],
  [/^(?<name>.+) answered your question: (?<title>.+)$/, "{name} answered your question: {title}"],
  [/^Your answer solved a question: (?<title>.+)$/, "Your answer solved a question: {title}"],
  [/^Ready to start: (?<title>.+)$/, "Ready to start: {title}"],
  [/^You are a teaching assistant for (?<code>.+)$/, "You are a teaching assistant for {code}"],
  [/^(?<title>.+) is done\.$/s, "{title} is done."],
  [/^(?<team>.+) asks for more time on (?<title>.+)$/, "{team} asks for more time on {title}"],
  [/^More time on (?<title>.+): due (?<date>\w{3} \d{2} \w{3})$/, "More time on {title}: due {date}"],
  [/^No extension on (?<title>.+)$/, "No extension on {title}"],
  [/^(?<team>.+) handed in (?<title>.+)$/, "{team} handed in {title}"],
  [/^(?<team>.+) resubmitted (?<title>.+)$/, "{team} resubmitted {title}"],
  // Bodies
  [/^Shared a file$/, "Shared a file"],
  [/^(?<name>[^:]+): Shared a file$/, "{name}: Shared a file"],
  [/^(?<code>.+) · due (?<date>\w{3} \d{2} \w{3})$/, "{code} · due {date}"],
  [/^(?<team>.+) · (?<date>\w{3} \d{2} \w{3})$/, "{team} · {date}"],
  [/^Your team's marks and feedback are on the course page\.$/, "Your team's marks and feedback are on the course page."],
  [/^Until (?<date>\w{3} \d{2} \w{3}): (?<rest>.*)$/s, "Until {date}: {rest}"],
  [/^It is still due (?<date>\w{3} \d{2} \w{3})\.$/, "It is still due {date}."],
  [/^It was due (?<date>\w{3} \d{2} \w{3}) and is not marked done\.$/, "It was due {date} and is not marked done."],
  [/^Oldest was due (?<date>\w{3} \d{2} \w{3})\. It may be worth checking in\.$/, "Oldest was due {date}. It may be worth checking in."],
  [/^Noticed: (?<reasons>.+)\. A short update to your team, or asking for help, goes a long way\.$/, "Noticed: {reasons}. A short update to your team, or asking for help, goes a long way."],
  [/^Still (?<reasons>.+), 3 days after a private nudge\.$/, "Still {reasons}, 3 days after a private nudge."],
  [/^Read it and agree, or suggest changes, so everyone knows what to expect\.$/, "Read it and agree, or suggest changes, so everyone knows what to expect."],
  [/^(?<when>.+)\. Pick another time on the course page\.$/, "{when}. Pick another time on the course page."],
  [/^A teammate rated your contribution\.$/, "A teammate rated your contribution."],
  [/^What got done, what is late and what you decided last week\.$/, "What got done, what is late and what you decided last week."],
  [/^Three quick answers: what you finished, what is next, and anything blocking you\.$/, "Three quick answers: what you finished, what is next, and anything blocking you."],
  // Office-hours bodies start with the slot's time ("Mon 23 Nov, 15:20 · Room 402: topic"); only the time is ours.
  [/^(?<when>\w{3} \d{1,2} \w{3}, \d{2}:\d{2})(?<rest>.*)$/s, "{when}{rest}"],
];

// Words inside the filled-in values that the SQL also wrote in English.
const FALLBACK_NAMES = new Set(["a teammate", "A teammate", "A student", "A classmate"]);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 23 Nov" (Postgres 'Dy DD Mon', optionally ", 14:30") in the reader's language. */
function localDate(locale: Locale, s: string) {
  if (locale === "en") return s;
  const nf = new Intl.NumberFormat("bn-BD", { useGrouping: false });
  return s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => translate(locale, d))
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => translate(locale, m))
    .replace(/\d/g, (d) => nf.format(+d));
}

/** One falling-behind reason ("2 overdue tasks", "no team chat for 9 days", "low peer review scores"). */
export function translateReason(locale: Locale, r: string) {
  let m = r.match(/^(\d+) overdue tasks?$/);
  if (m) return translate(locale, +m[1] === 1 ? "{n} overdue task" : "{n} overdue tasks", { n: +m[1] });
  m = r.match(/^no team chat for (\d+) days$/);
  if (m) return translate(locale, "no team chat for {n} days", { n: +m[1] });
  return translate(locale, r);
}

export function translateNotice(locale: Locale, text: string): string {
  if (locale === "en" || !text) return text;
  for (const [re, key] of TEMPLATES) {
    const m = text.match(re);
    if (!m) continue;
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(m.groups ?? {})) {
      if (k === "n") vars[k] = +v;
      else if (k === "date" || k === "when") vars[k] = localDate(locale, v);
      else if (k === "rest") vars[k] = v; // the person's own text (location, topic)
      else if (k === "reasons") vars[k] = v.split(", ").map((r) => translateReason(locale, r)).join(", ");
      else vars[k] = FALLBACK_NAMES.has(v) ? translate(locale, v) : v;
    }
    return translate(locale, key, vars);
  }
  return text;
}

export const NOTICE_KEYS = TEMPLATES.map(([, k]) => k);
export const NOTICE_WORDS = [...FALLBACK_NAMES, ...DAYS, ...MONTHS, "{n} overdue task", "{n} overdue tasks", "no team chat for {n} days", "low peer review scores"];
