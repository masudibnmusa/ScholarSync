// Grade maths shared by the instructor's grading view, the student's grade card and the CSV export.
// Self-check: node src/lib/grading.check.mjs

export const FACTOR_MIN = 0.85;
export const FACTOR_MAX = 1.15;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Team percentage from rubric points; null until every criterion has a mark. */
export function teamPercent(criteria: { id: string; maxPoints: number }[], points: Record<string, number | undefined>) {
  if (!criteria.length || criteria.some((c) => points[c.id] == null)) return null;
  const max = criteria.reduce((n, c) => n + c.maxPoints, 0);
  const got = criteria.reduce((n, c) => n + Math.min(points[c.id]!, c.maxPoints), 0);
  return round((got / max) * 100, 1);
}

/**
 * Contribution factor suggested from peer reviews: the student's average rating relative to the team's
 * average of member averages, kept within ±15%. 1 when the student or team has no reviews.
 */
export function suggestedFactor(memberAvg: number | null, teamAvgs: (number | null)[]) {
  const rated = teamAvgs.filter((a): a is number => a != null);
  if (memberAvg == null || !rated.length) return 1;
  const mean = rated.reduce((n, a) => n + a, 0) / rated.length;
  if (mean <= 0) return 1;
  return round(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, memberAvg / mean)), 2);
}

/** A student's grade: team percentage times their factor, capped at 100. */
export function finalPercent(team: number | null, factor: number) {
  return team == null ? null : round(Math.min(100, team * factor), 1);
}
