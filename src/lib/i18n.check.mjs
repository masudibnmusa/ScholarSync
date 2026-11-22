// Self-check for the Bangla dictionary. Run: node src/lib/i18n.check.mjs
// Every text the code translates (t, tn, msg, translate, translatePlural, and the notification templates) must have a
// Bangla entry with the same {placeholders}, so nothing shows up half in English.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bn } from "./i18n/bn.ts";
import { translate, translatePlural } from "./i18n/index.ts";
import { NOTICE_KEYS, NOTICE_WORDS, translateNotice, translateReason } from "./i18n/notices.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url)); // src/
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !p.includes("/i18n/")) files.push(p);
  }
})(ROOT);

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const PATTERNS = [
  new RegExp(String.raw`(?<![\w.])(?:t|msg|pageTitle)\(\s*${STR}`, "g"),
  new RegExp(String.raw`(?<![\w.])tn\([^,]+,\s*${STR}\s*,\s*${STR}`, "g"),
  new RegExp(String.raw`(?<![\w.])translate\([^,"]+,\s*${STR}`, "g"),
  new RegExp(String.raw`(?<![\w.])translatePlural\([^,"]+,[^,]+,\s*${STR}\s*,\s*${STR}`, "g"),
];
const keys = new Map(); // key -> first file
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const re of PATTERNS) for (const m of src.matchAll(re)) for (const k of m.slice(1).filter((x) => x !== undefined)) {
    const key = JSON.parse(`"${k}"`);
    if (!keys.has(key)) keys.set(key, f.slice(ROOT.length));
  }
}
for (const k of [...NOTICE_KEYS, ...NOTICE_WORDS]) if (!keys.has(k)) keys.set(k, "lib/i18n/notices.ts");
assert.ok(keys.size > 1000, `found only ${keys.size} texts; the extractor is probably broken`);

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const missing = [...keys].filter(([k]) => !(k in bn));
assert.equal(missing.length, 0, `${missing.length} texts have no Bangla entry, e.g.:\n${missing.slice(0, 25).map(([k, f]) => `  ${f}: ${JSON.stringify(k)}`).join("\n")}`);
const badVars = [...keys.keys()].filter((k) => vars(k) !== vars(bn[k]));
assert.equal(badVars.length, 0, `placeholders differ:\n${badVars.slice(0, 10).map((k) => `  ${JSON.stringify(k)} → ${JSON.stringify(bn[k])}`).join("\n")}`);
const untranslated = [...keys.keys()].filter((k) => /[a-z]{3}/i.test(k.replace(/\{\w+\}/g, "")) && bn[k] === k && !/^(ScholarSync|GitHub|Moodle|Canvas|CSV|AI|Enter|Shift \+ Enter|Esc|Ctrl|⌘K|@\w+)/.test(k));
assert.ok(untranslated.length < 40, `too many entries are still English:\n${untranslated.slice(0, 20).map((k) => "  " + JSON.stringify(k)).join("\n")}`);

// Behaviour: fallback, placeholders in Bangla digits, plurals, notifications.
assert.equal(translate("bn", "No such text {x}", { x: 3 }), "No such text ৩");
assert.equal(translate("en", "Due in {days} days", { days: 2 }), "Due in 2 days");
assert.match(translate("bn", "Due in {days} days", { days: 2 }), /২/);
assert.equal(translatePlural("en", 1, "{n} task", "{n} tasks"), "1 task");
assert.equal(translatePlural("en", 4, "{n} task", "{n} tasks"), "4 tasks");
assert.equal(translateNotice("en", "Ada mentioned you"), "Ada mentioned you");
assert.equal(translateNotice("bn", "Ada mentioned you"), translate("bn", "{name} mentioned you", { name: "Ada" }));
assert.ok(translateNotice("bn", "Team Nova has 4 overdue tasks").includes("Team Nova"));
assert.ok(translateNotice("bn", "Team Nova has 4 overdue tasks").includes("৪"));
assert.equal(translateNotice("bn", "Something a user wrote"), "Something a user wrote");
assert.ok(!/overdue/.test(translateNotice("bn", "Noticed: 2 overdue tasks, no team chat for 9 days. A short update to your team, or asking for help, goes a long way.")));
assert.ok(!/Mon|Nov/.test(translateNotice("bn", "It was due Mon 23 Nov and is not marked done.")));
assert.equal(translateReason("bn", "1 overdue task"), translate("bn", "{n} overdue task", { n: 1 }));

console.log(`i18n: all checks passed (${keys.size} texts)`);
