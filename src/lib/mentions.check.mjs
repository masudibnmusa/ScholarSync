// Self-check for the @mention helpers in utils.ts; mirrors the SQL tests of public.mentions().
// Run: node src/lib/mentions.check.mjs
import assert from "node:assert/strict";
import { isMentionOf, MENTION_RE, mentionHandle } from "./utils.ts";

assert.equal(mentionHandle("Md Nazmul Hasan"), "Nazmul"); // skips short prefixes
assert.equal(mentionHandle("Masud Ibn Musa"), "Masud");
assert.equal(mentionHandle("Al"), "Al");

assert.ok(isMentionOf("nazmul", "Md Nazmul Hasan"));
assert.ok(isMentionOf("Md", "Md Nazmul Hasan")); // the first word always counts
assert.ok(isMentionOf("Nazmul.", "Md Nazmul Hasan")); // end of sentence
assert.ok(isMentionOf("ibn", "Masud Ibn Musa")); // 3+ letters counts, any case
assert.ok(!isMentionOf("nazmulx", "Md Nazmul Hasan"));
assert.ok(!isMentionOf("na", "Md Nazmul Hasan"));

const tokens = (s) => [...s.matchAll(MENTION_RE)].map((m) => m[2]);
assert.deepEqual(tokens("hey @Nazmul, and @Sara!"), ["Nazmul", "Sara"]);
assert.deepEqual(tokens("email nazmul@x.com"), []); // not a mention
assert.deepEqual(tokens("@Md hi"), ["Md"]);

console.log("mentions: all checks passed");
