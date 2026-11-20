// Self-check for csvCell/toCsv in utils.ts. Run: node src/lib/csv.check.mjs
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./utils.ts";

assert.equal(csvCell("Team Nova"), "Team Nova");
assert.equal(csvCell('Say "hi", ok'), '"Say ""hi"", ok"');
assert.equal(csvCell("two\nlines"), '"two\nlines"');
assert.equal(csvCell(4.5), "4.5");
assert.equal(csvCell(null), "");
// Formula injection: a name like =HYPERLINK(...) must not run in Excel or Sheets.
assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
assert.equal(csvCell("+1"), "'+1");
assert.equal(csvCell("@cmd"), "'@cmd");
assert.equal(csvCell(-3), "-3"); // real numbers stay numbers
assert.equal(toCsv([["a", 1], ["b,c", null]]), 'a,1\r\n"b,c",');

console.log("csv: all checks passed");
