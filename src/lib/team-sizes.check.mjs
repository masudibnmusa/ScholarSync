// Self-check for team-sizes.ts. Run: node src/lib/team-sizes.check.mjs
import assert from "node:assert/strict";
import { fitToSizes, teamSizes } from "./team-sizes.ts";

assert.deepEqual(teamSizes(26, 5), [6, 5, 5, 5, 5]);
assert.deepEqual(teamSizes(26, 3), [4, 4, 3, 3, 3, 3, 3, 3]);
assert.deepEqual(teamSizes(26, 4), [5, 5, 4, 4, 4, 4]);
assert.deepEqual(teamSizes(10, 5), [5, 5]);
assert.deepEqual(teamSizes(7, 5), [7]); // never a team of 2 left over
assert.deepEqual(teamSizes(3, 2), [3]);

// The real failure: 26 students at 5 per team came back as 6,6,5,4,3,2.
const ids = Array.from({ length: 26 }, (_, i) => `s${i}`);
const t = (n, from, len) => ({ name: n, score: 80, strengths: [], member_ids: ids.slice(from, from + len) });
const bad = [t("A", 0, 6), t("B", 6, 6), t("C", 12, 5), t("D", 17, 4), t("E", 21, 3), t("F", 24, 2)];
const fixed = fitToSizes(bad, teamSizes(26, 5), ids);
assert.deepEqual(fixed.map((x) => x.member_ids.length), [6, 5, 5, 5, 5]);
assert.deepEqual(fixed.flatMap((x) => x.member_ids).sort(), [...ids].sort()); // everyone placed exactly once

// Model left two students out and made too few teams.
const short = fitToSizes([t("A", 0, 12), t("B", 12, 12)], teamSizes(26, 5), ids);
assert.deepEqual(short.map((x) => x.member_ids.length), [6, 5, 5, 5, 5]);
assert.equal(new Set(short.flatMap((x) => x.member_ids)).size, 26);

console.log("team-sizes: all checks passed");
