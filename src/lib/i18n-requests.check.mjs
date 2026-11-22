// Self-check: while server rendering, each request keeps its own language even when renders interleave.
// Run: node src/lib/i18n-requests.check.mjs
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

globalThis.AsyncLocalStorage = AsyncLocalStorage; // as Next.js does on the server, before the module loads
const { setServerLocale, currentLocale, num } = await import("./i18n/index.ts");

const tick = () => new Promise((r) => setTimeout(r, 5));
// A "render": sets the language at the top like LocaleProvider, then reads it after waiting for data, like a suspended part.
async function render(locale) {
  setServerLocale(locale);
  const seen = [currentLocale()];
  for (let i = 0; i < 3; i++) { await tick(); seen.push(currentLocale(), num(7)); }
  return seen;
}
// Each request starts from its own callback (as an incoming HTTP request does), not from this script's top level.
const request = (locale) => new Promise((resolve) => setImmediate(() => resolve(render(locale))));
const [en, bn] = await Promise.all([request("en"), request("bn")]);
assert.deepEqual(en, ["en", "en", "7", "en", "7", "en", "7"]);
assert.deepEqual(bn, ["bn", "bn", "৭", "bn", "৭", "bn", "৭"]);
assert.equal(currentLocale(), "en"); // outside any request: English
console.log("i18n requests: all checks passed");
