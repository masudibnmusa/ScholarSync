// Self-check for ics.ts. Run: node src/lib/ics.check.mjs
import assert from "node:assert/strict";
import { buildIcs } from "./ics.ts";

const out = buildIcs([
  { uid: "t1", date: "2026-12-31", title: "Due: Slides, demo; final\\v2", description: "Team Nova\nCSE-3200", url: "http://x/student" },
  { uid: "t2", date: "2026-11-24", title: "শিক্ষার্থী ".repeat(12), description: "", url: "http://x" },
], new Date("2026-11-20T08:09:10.123Z"));

assert.ok(out.startsWith("BEGIN:VCALENDAR\r\n") && out.endsWith("END:VCALENDAR\r\n"));
assert.ok(out.includes("DTSTAMP:20261120T080910Z"));
assert.ok(out.includes("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101"), "end is the next day, across a year");
assert.ok(out.includes("SUMMARY:Due: Slides\\, demo\; final\\\\v2"));
assert.ok(out.includes("DESCRIPTION:Team Nova\\nCSE-3200"));
for (const l of out.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, `line too long: ${l}`);
const unfolded = out.replace(/\r\n /g, "");
assert.ok(unfolded.includes("SUMMARY:" + "শিক্ষার্থী ".repeat(12)), "folding keeps multi-byte text intact");
assert.equal((out.match(/BEGIN:VEVENT/g) ?? []).length, 2);

console.log("ics: all checks passed");
