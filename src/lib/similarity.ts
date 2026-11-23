// No imports: shared by the server and its unit test (node src/lib/similarity.check.mjs).

const K = 5;           // words per shingle
const MIN_SHINGLES = 8; // shorter texts (about a dozen words) are too short to judge
export const FLAG_AT = 0.5;

/** Overlapping runs of K words, lowercased, punctuation ignored (any script). */
export function shingles(text: string): Set<string> {
  const w = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + K <= w.length; i++) out.add(w.slice(i, i + K).join(" "));
  return out;
}

/**
 * How much of the shorter text also appears in the other, 0-1 (overlap coefficient on shingles), so copying part of
 * another team's work still scores high. 0 when either is too short to judge.
 */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size < MIN_SHINGLES || b.size < MIN_SHINGLES) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const s of small) if (big.has(s)) shared++;
  return shared / small.size;
}

/** A link reduced to host and path, so http/https, www., a trailing slash, .git, ?query and #hash don't hide a match. */
export function normalizeLink(url: string | null): string | null {
  if (!url) return null;
  const m = /^\s*(?:https?:\/\/)?(?:www\.)?([^/?#\s]+)([^?#\s]*)/i.exec(url);
  if (!m) return null;
  return `${m[1].toLowerCase()}${m[2].replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase()}`;
}

export interface HandInText { id: string; text: string; link: string | null }
export interface SimilarPair { a: string; b: string; score: number; sameLink: boolean }

/** Pairs of hand-ins that share a link or whose text overlaps at least FLAG_AT, most similar first. */
export function similarPairs(items: HandInText[]): SimilarPair[] {
  const prepared = items.map((x) => ({ id: x.id, sh: shingles(x.text), link: normalizeLink(x.link) }));
  const out: SimilarPair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const [p, q] = [prepared[i], prepared[j]];
      const score = similarity(p.sh, q.sh);
      const sameLink = !!p.link && p.link === q.link;
      if (sameLink || score >= FLAG_AT) out.push({ a: p.id, b: q.id, score: Math.round(score * 100), sameLink });
    }
  }
  return out.sort((x, y) => Number(y.sameLink) - Number(x.sameLink) || y.score - x.score);
}
