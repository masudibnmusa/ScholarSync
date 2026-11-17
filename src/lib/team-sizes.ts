// Exact team sizes for AI matching. The model is told these sizes, and its answer is then corrected to them,
// because a model asked for "teams of 5" doesn't reliably produce them.

/** Splits n students into teams of `size`; the leftover goes one each onto the first teams (26 by 5 → 6,5,5,5,5). */
export function teamSizes(n: number, size: number): number[] {
  if (n <= 0) return [];
  const count = Math.max(1, Math.floor(n / size));
  const base = Math.floor(n / count);
  return Array.from({ length: count }, (_, i) => base + (i < n % count ? 1 : 0));
}

type Draft = { name: string; score: number; strengths: string[]; member_ids: string[] };

/**
 * Reshapes the model's teams to exactly `sizes`: the biggest teams get the biggest sizes, extra members and
 * anyone the model left out fill the short teams, and missing teams are added.
 * shortcut: who moves is picked by position, not by skills; fine while the model is usually close, revisit if it often isn't.
 */
export function fitToSizes(teams: Draft[], sizes: number[], allIds: string[]): Draft[] {
  const sorted = [...teams].sort((a, b) => b.member_ids.length - a.member_ids.length);
  const kept = sorted.slice(0, sizes.length).map((t) => ({ ...t, member_ids: [...t.member_ids] }));
  const placed = new Set(kept.flatMap((t) => t.member_ids));
  const pool = allIds.filter((id) => !placed.has(id)); // dropped teams' members and anyone left out
  while (kept.length < sizes.length) kept.push({ name: `Team ${kept.length + 1}`, score: 70, strengths: [], member_ids: [] });

  const target = [...sizes].sort((a, b) => b - a);
  kept.forEach((t, i) => { while (t.member_ids.length > target[i]) pool.push(t.member_ids.pop()!); });
  kept.forEach((t, i) => { while (t.member_ids.length < target[i] && pool.length) t.member_ids.push(pool.shift()!); });
  return kept;
}
