// Self-check for digest-format.ts. Run: node src/lib/digest-format.check.mjs
import assert from "node:assert/strict";
import { buildDigest, buildInstructorDigest, escapeHtml, weeklyCount } from "./digest-format.ts";

assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");

const one = buildDigest("Masud Ibn Musa", [{ title: "Due tomorrow: Slides", body: "Team Nova", href: "http://app/student" }], "http://app/profile");
assert.equal(one.subject, "ScholarSync: Due tomorrow: Slides");
assert.match(one.text, /^Hi Masud,/);
assert.match(one.text, /http:\/\/app\/student/);

const evil = buildDigest("<b>X</b>", [{ title: "<script>alert(1)</script>", body: "a & b", href: 'http://app/"onmouseover="x' }, { title: "t", body: "", href: "http://app" }], "http://app/profile");
assert.equal(evil.subject, "ScholarSync: 2 updates for you");
assert.ok(!evil.html.includes("<script>"), "titles are escaped");
assert.ok(!evil.html.includes("<b>X</b>"), "names are escaped");
assert.ok(!evil.html.includes('"onmouseover="'), "links can't break out of href");
assert.ok(evil.html.includes("a &amp; b"));

// In the recipient's language: the wording and the notification text are translated, names stay as written.
const bn = buildDigest("Masud Ibn Musa", [{ title: "Ada mentioned you", body: "Shared a file", href: "http://app" }, { title: "t", body: "", href: "http://app" }], "http://app/profile", "bn");
assert.match(bn.subject, /২টি আপডেট/);
assert.match(bn.text, /^হ্যালো Masud,/);
assert.match(bn.text, /Ada আপনাকে মেনশন করেছেন/);
assert.match(bn.html, /<html lang="bn">/);

// The instructor's Monday summary: only sections with something in them, everything escaped, in their language.
const week = {
  risk: [{ student: "Ada <b>", team: "Team Nova", course: "CSE-3200", reasons: ["2 overdue tasks", "no team chat for 9 days"], href: "http://app/i/1" }],
  conflicts: [],
  extensions: [{ team: "Team Orbit", course: "CSE-3200", milestone: "Proposal", until: "2026-12-04", href: "http://app/i/2" }],
  missing: [{ team: "Team Orbit", course: "CSE-3200", milestone: "Demo", due: "2026-11-20", href: "http://app/i/3" }],
};
assert.equal(weeklyCount(week), 3);
const w = buildInstructorDigest("Selim Reja", week, "http://app/profile");
assert.equal(w.subject, "ScholarSync: your week, 3 things to look at");
assert.match(w.text, /^Hi Selim,/);
assert.match(w.text, /Students falling behind \(1\)\n- Ada <b> · Team Nova \(CSE-3200\): 2 overdue tasks, no team chat for 9 days/);
assert.match(w.text, /Requests for more time \(1\)\n- Team Orbit \(CSE-3200\): Proposal, until Fri 4 Dec/);
assert.match(w.text, /Missing hand-ins \(1\)\n- Team Orbit \(CSE-3200\): Demo, due Fri 20 Nov/);
assert.ok(!w.text.includes("Open conflicts"), "empty sections are left out");
assert.ok(!w.html.includes("Ada <b>") && w.html.includes("Ada &lt;b&gt;"), "names are escaped");
const wbn = buildInstructorDigest("Selim Reja", week, "http://app/profile", "bn");
assert.match(wbn.subject, /৩/);
assert.match(wbn.text, /পিছিয়ে পড়া শিক্ষার্থী \(১\)/, "section titles are translated");
assert.ok(!wbn.text.includes("overdue tasks"), "reasons are translated");

console.log("digest-format: all checks passed");
