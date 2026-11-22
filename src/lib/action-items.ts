// No imports: shared by the server and its unit test (node --test src/lib/action-items.test.mjs).

export interface RawActionItem { title: string; description: string; owner: string; due: string }
export interface ActionItem { title: string; description: string; ownerId: string | null; dueDate: string | null }

export const MAX_ACTION_ITEMS = 15;
const DAY = 86_400_000;

/**
 * The AI's action items, made safe to show: titles trimmed and de-duplicated, an owner only when the name is a team
 * member (full name, or a first name only one member has), a due date only when it's a real date within a year from
 * today. Anything else is left blank for the student to fill in.
 */
export function cleanActionItems(raw: RawActionItem[], members: { id: string; name: string }[], today: string): ActionItem[] {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const first = (s: string) => norm(s).split(" ")[0];
  const owner = (name: string) => {
    const n = norm(name);
    if (!n) return null;
    const full = members.find((m) => norm(m.name) === n);
    if (full) return full.id;
    const byFirst = members.filter((m) => first(m.name) === n);
    return byFirst.length === 1 ? byFirst[0].id : null;
  };
  const due = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const t = Date.parse(`${d}T00:00:00Z`);
    const from = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return null; // e.g. 2026-02-30
    return t >= from && t <= from + 365 * DAY ? d : null;
  };

  const seen = new Set<string>();
  const out: ActionItem[] = [];
  for (const r of raw) {
    const title = r.title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, description: r.description.trim().slice(0, 1000), ownerId: owner(r.owner), dueDate: due(r.due.trim()) });
    if (out.length === MAX_ACTION_ITEMS) break;
  }
  return out;
}
