import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLink, shingles, similarity, similarPairs } from "./similarity.ts";

const essay = "Our system stores each order in a queue and a worker charges the card, then emails the receipt to the customer when payment succeeds.";
const other = "We built a timetable planner that reads the course list, finds clashes between lectures and suggests a week with fewer early starts.";

test("similarity: identical, partly copied, unrelated and too short", () => {
  assert.equal(similarity(shingles(essay), shingles(essay)), 1);
  assert.equal(similarity(shingles(essay), shingles(`${essay.toUpperCase()}!!`)), 1, "case and punctuation are ignored");
  const padded = `${other} ${essay} Then we added tests for the refund flow and wrote the deployment guide for the team.`;
  assert.ok(similarity(shingles(essay), shingles(padded)) > 0.9, "copying a whole paragraph into a longer text still scores high");
  assert.ok(similarity(shingles(essay), shingles(other)) < 0.1);
  assert.equal(similarity(shingles("see the repo"), shingles("see the repo")), 0, "too short to judge");
});

test("similarity works on Bangla text too", () => {
  const bn = "আমাদের সিস্টেম প্রতিটি অর্ডার একটি সারিতে রাখে এবং একজন কর্মী কার্ড থেকে টাকা কাটে তারপর গ্রাহককে রসিদ ইমেইল করে দেয়";
  assert.equal(similarity(shingles(bn), shingles(bn)), 1);
  assert.equal(shingles("আমাদের সিস্টেম প্রতিটি অর্ডার একটি").size, 1, "vowel signs stay inside words");
});

test("normalizeLink ignores scheme, www, trailing slash, .git, query and hash", () => {
  for (const u of ["https://github.com/Team/App", "http://www.github.com/team/app/", "github.com/team/app.git", "https://github.com/team/app?tab=readme#top"]) {
    assert.equal(normalizeLink(u), "github.com/team/app", u);
  }
  assert.equal(normalizeLink(null), null);
  assert.notEqual(normalizeLink("https://github.com/team/app"), normalizeLink("https://github.com/team/app2"));
});

test("similarPairs flags shared links and copied text, most similar first", () => {
  const pairs = similarPairs([
    { id: "A", text: essay, link: "https://github.com/x/shop" },
    { id: "B", text: other, link: "https://github.com/x/shop/" },
    { id: "C", text: `${essay} We also wrote tests.`, link: null },
    { id: "D", text: "Short note.", link: null },
  ]);
  assert.deepEqual(pairs.map((p) => [p.a, p.b, p.sameLink]), [["A", "B", true], ["A", "C", false]]);
  assert.equal(pairs[1].score, 100);
});
