// Self-check for grading.ts. Run: node src/lib/grading.check.mjs
import assert from "node:assert/strict";
import { finalPercent, reviewFlags, suggestedFactor, teamPercent } from "./grading.ts";

const crit = [{ id: "a", maxPoints: 30 }, { id: "b", maxPoints: 70 }];
assert.equal(teamPercent(crit, { a: 24, b: 56 }), 80);
assert.equal(teamPercent(crit, { a: 24 }), null); // not fully marked yet
assert.equal(teamPercent([], {}), null);
assert.equal(teamPercent(crit, { a: 40, b: 70 }), 100); // over-max points are capped
assert.equal(teamPercent([{ id: "a", maxPoints: 3 }], { a: 2 }), 66.7);

// Team averages 5, 4 and 3 → mean 4.
assert.equal(suggestedFactor(5, [5, 4, 3]), 1.15); // 1.25 capped at +15%
assert.equal(suggestedFactor(4, [5, 4, 3]), 1);
assert.equal(suggestedFactor(3.6, [5, 4, 3]), 0.9);
assert.equal(suggestedFactor(2, [5, 4, 3]), 0.85); // 0.5 floored at -15%
assert.equal(suggestedFactor(null, [5, 4]), 1); // nobody reviewed this student
assert.equal(suggestedFactor(4, [null, null]), 1);

assert.equal(finalPercent(80, 1.1), 88);
assert.equal(finalPercent(95, 1.15), 100); // never above 100
assert.equal(finalPercent(null, 1), null);

const r = (reviewerId, revieweeId, rating) => ({ reviewerId, revieweeId, rating });
assert.deepEqual(reviewFlags([r("a", "c", 5), r("b", "c", 4), r("d", "c", 1)]), [[], [], ["far-from-others"]]); // 1 vs median 4
assert.deepEqual(reviewFlags([r("a", "c", 1), r("b", "c", 5)]), [["far-from-others"], ["far-from-others"]]); // two reviewers far apart: both shown
assert.deepEqual(reviewFlags([r("a", "c", 4), r("b", "c", 5)]), [[], []]);
assert.deepEqual(reviewFlags([r("a", "b", 1), r("a", "c", 1), r("b", "a", 4)]), [["all-lowest"], ["all-lowest"], []]);
assert.deepEqual(reviewFlags([r("a", "b", 1)]), [[]], "one review alone is not a pattern");

console.log("grading: all checks passed");
