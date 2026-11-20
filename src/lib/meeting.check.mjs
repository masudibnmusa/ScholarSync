// Self-check for meeting.ts. Run: node src/lib/meeting.check.mjs
import assert from "node:assert/strict";
import { cleanSlots, proposalMessage, slotLabel } from "./meeting.ts";

const members = ["Masud", "Nazmul", "Chinmoy"];
const s = (date, start, extra = {}) => ({ date, start, minutes: 60, attendees: ["Masud", "Ghost"], note: "n", ...extra });
const out = cleanSlots([
  s("2026-11-20", "19:00"), // today: not in the future
  s("2026-11-21", "19:00"),
  s("2026-11-21", "19:00"), // duplicate
  s("2026-12-10", "19:00"), // beyond 14 days
  s("2026-11-22", "25:00"), // bad time
  s("2026-11-23", "7pm"),   // bad format
  s("2026-11-24", "18:30", { minutes: 400 }),
  s("2026-11-25", "10:00", { minutes: 0 }),
  s("2026-11-26", "10:00"), // fourth valid: dropped
], members, "2026-11-20");
assert.deepEqual(out.map((x) => x.date), ["2026-11-21", "2026-11-24", "2026-11-25"]);
assert.deepEqual(out[0].attendees, ["Masud"], "unknown names are dropped");
assert.equal(out[1].minutes, 120);
assert.equal(out[2].minutes, 60);

assert.equal(slotLabel({ date: "2026-11-23", start: "18:30", minutes: 90 }), "Mon 23 Nov, 18:30–20:00");
assert.match(proposalMessage({ ...out[0], attendees: members }, 3), /works for everyone/);
assert.match(proposalMessage(out[0], 3), /works for Masud,/);

console.log("meeting: all checks passed");
