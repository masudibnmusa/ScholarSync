import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanActionItems, MAX_ACTION_ITEMS } from "./action-items.ts";

const members = [{ id: "a", name: "Ada Lovelace" }, { id: "b", name: "Ben Ito" }, { id: "c", name: "Ben Ross" }];
const item = (over) => ({ title: "Write the schema", description: "", owner: "", due: "", ...over });

test("owners are team members only: full name, or a first name nobody else has", () => {
  const out = cleanActionItems([
    item({ title: "A", owner: "ada lovelace" }), item({ title: "B", owner: "Ada" }), item({ title: "C", owner: "Ben" }),
    item({ title: "D", owner: "Ben  Ross" }), item({ title: "E", owner: "Grace Hopper" }), item({ title: "F", owner: "" }),
  ], members, "2026-11-22");
  assert.deepEqual(out.map((i) => i.ownerId), ["a", "a", null, "c", null, null]);
});

test("due dates must be real, not in the past, and within a year", () => {
  const out = cleanActionItems([
    item({ title: "A", due: "2026-11-27" }), item({ title: "B", due: "2026-11-22" }), item({ title: "C", due: "2026-11-21" }),
    item({ title: "D", due: "2027-02-30" }), item({ title: "E", due: "2028-01-01" }), item({ title: "F", due: "next Friday" }),
  ], members, "2026-11-22");
  assert.deepEqual(out.map((i) => i.dueDate), ["2026-11-27", "2026-11-22", null, null, null, null]);
});

test("titles are trimmed, de-duplicated and capped", () => {
  const out = cleanActionItems([item({ title: "  Write   the schema " }), item({ title: "write the SCHEMA" }), item({ title: "   " })], members, "2026-11-22");
  assert.deepEqual(out.map((i) => i.title), ["Write the schema"]);
  const many = Array.from({ length: 30 }, (_, i) => item({ title: `Task ${i}` }));
  assert.equal(cleanActionItems(many, members, "2026-11-22").length, MAX_ACTION_ITEMS);
});
