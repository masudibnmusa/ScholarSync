// Self-check for safeNext in utils.ts (open-redirect guard). Run: node src/lib/safe-next.check.mjs
import assert from "node:assert/strict";
import { safeNext } from "./utils.ts";

assert.equal(safeNext("/join/KYM73W"), "/join/KYM73W");
assert.equal(safeNext("/student/courses?x=1"), "/student/courses?x=1");
assert.equal(safeNext("//evil.com"), null); // protocol-relative: another site
assert.equal(safeNext("/\\evil.com"), null); // browsers treat "/\" like "//"
assert.equal(safeNext("https://evil.com"), null);
assert.equal(safeNext("javascript:alert(1)"), null);
assert.equal(safeNext(""), null);
assert.equal(safeNext(undefined), null);
assert.equal(safeNext(["/a", "/b"]), null);

console.log("safeNext: all checks passed");
