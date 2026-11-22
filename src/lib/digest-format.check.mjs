// Self-check for digest-format.ts. Run: node src/lib/digest-format.check.mjs
import assert from "node:assert/strict";
import { buildDigest, escapeHtml } from "./digest-format.ts";

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

console.log("digest-format: all checks passed");
