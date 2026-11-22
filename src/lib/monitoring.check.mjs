// Self-check for monitoring.ts's scrubbing. Run: node src/lib/monitoring.check.mjs
import assert from "node:assert/strict";
import { scrub } from "./monitoring.ts";

const ev = {
  user: { id: "u1", ip_address: "::1", email: "a@b.c" },
  request: { url: "http://x/student?team=1&token=s", cookies: { a: "b" }, headers: { cookie: "a=b", "x-forwarded-for": "1.2.3.4" }, query_string: "team=1", data: "x" },
};
assert.deepEqual(scrub(structuredClone(ev), {}), { user: { id: "u1" }, request: { url: "http://x/student" } });
assert.deepEqual(scrub({ user: { ip_address: "::1" } }, {}), { user: undefined }, "an IP alone is dropped");
assert.equal(scrub(structuredClone(ev), { originalException: Object.assign(new Error("bad"), { name: "ZodError" }) }), null);
assert.ok(scrub(structuredClone(ev), { originalException: new Error("real") }), "other errors are kept");
console.log("monitoring: all checks passed");
