// Self-check for daysUntil/weekBucket in utils.ts. Run: node src/lib/week.check.mjs
import assert from "node:assert/strict";
import { daysUntil, weekBucket } from "./utils.ts";

const fri = new Date(2026, 10, 20, 23, 30); // Friday 20 Nov 2026, late evening
assert.equal(daysUntil("2026-11-20", fri), 0);
assert.equal(daysUntil("2026-11-21", fri), 1);
assert.equal(daysUntil("2026-11-19", fri), -1);
assert.equal(daysUntil("2026-12-01", fri), 11); // across a month end

assert.equal(weekBucket("2026-11-02", fri), "Overdue");
assert.equal(weekBucket("2026-11-20", fri), "Today");
assert.equal(weekBucket("2026-11-21", fri), "Tomorrow");
assert.equal(weekBucket("2026-11-23", fri), new Date(2026, 10, 23).toLocaleDateString(undefined, { weekday: "long" })); // Monday
assert.equal(weekBucket("2026-11-27", fri), "Next week"); // 7 days on
assert.equal(weekBucket("2026-12-03", fri), "Next week"); // 13 days on
assert.equal(weekBucket("2026-12-04", fri), "Later");

console.log("week: all checks passed");
