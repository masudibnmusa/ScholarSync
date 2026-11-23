import assert from "node:assert/strict";
import { test } from "node:test";
import { citeAnswer, sourceBlock } from "./study-buddy.ts";

const src = (title, text = "x") => ({ kind: "announcement", title, text, link: `/a/${title}` });

test("citeAnswer numbers sources by first use and lists them in that order", () => {
  const sources = [src("A"), src("B"), src("C")];
  const out = citeAnswer("Due Friday [S3]. Use the template [S1, S3]. Late work loses points [S1].", sources);
  assert.equal(out.answer, "Due Friday [1]. Use the template [2][1]. Late work loses points [2].");
  assert.deepEqual(out.cited.map((c) => [c.n, c.title]), [[1, "C"], [2, "A"]]);
});

test("citeAnswer drops made-up and malformed citations", () => {
  const out = citeAnswer("Yes [S9]. No [S0] . Maybe [s2].", [src("A"), src("B")]);
  assert.equal(out.answer, "Yes. No. Maybe [1].");
  assert.deepEqual(out.cited.map((c) => c.title), ["B"]);
});

test("citeAnswer leaves an answer without sources alone", () => {
  assert.deepEqual(citeAnswer("The course materials don't say.", [src("A")]), { answer: "The course materials don't say.", cited: [] });
});

test("sourceBlock tags each source and caps the length", () => {
  const block = sourceBlock([src("A", "hello"), src("B", "y".repeat(10_000)), ...Array.from({ length: 20 }, (_, i) => src(`C${i}`, "z".repeat(6_000)))]);
  assert.match(block, /^<sources>\n\[S1\] \(announcement\) A\nhello\n\n\[S2\] \(announcement\) B\ny{6000}\n/);
  assert.ok(block.length < 41_000, `block is ${block.length} chars`);
  assert.ok(!block.includes("[S22]"), "sources past the cap are dropped");
});
