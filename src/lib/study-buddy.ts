// No imports: shared by the server and its unit test (node src/lib/study-buddy.check.mjs).

export type SourceKind = "announcement" | "milestone" | "file";
export interface StudySource { kind: SourceKind; title: string; text: string; link: string }
export interface CitedSource { n: number; kind: SourceKind; title: string; link: string }

const PER_SOURCE = 6_000; // characters of one source the model sees
const TOTAL = 40_000;     // and of all of them together

/** The sources as one block for the model, each tagged [S1], [S2]… in order. Long ones are cut, then the rest dropped. */
export function sourceBlock(sources: StudySource[]): string {
  let left = TOTAL;
  const parts: string[] = [];
  sources.forEach((src, i) => {
    if (left <= 0) return;
    const text = src.text.slice(0, Math.min(PER_SOURCE, left));
    left -= text.length;
    parts.push(`[S${i + 1}] (${src.kind}) ${src.title}\n${text}`);
  });
  return `<sources>\n${parts.join("\n\n")}\n</sources>`;
}

/**
 * Turns the model's [S3] / [S1, S4] markers into [1], [2]… numbered by first use, and lists the sources it cited in that
 * order. Markers for sources that don't exist are dropped, so a made-up citation never shows.
 */
export function citeAnswer(answer: string, sources: StudySource[]): { answer: string; cited: CitedSource[] } {
  const order: number[] = [];
  const text = answer.replace(/\[\s*S\d+(?:\s*,\s*S?\d+)*\s*\]/gi, (m) => {
    const nums = [...m.matchAll(/\d+/g)].map((x) => Number(x[0]) - 1).filter((i) => i >= 0 && i < sources.length);
    const labels = nums.map((i) => {
      if (!order.includes(i)) order.push(i);
      return `[${order.indexOf(i) + 1}]`;
    });
    return [...new Set(labels)].join("");
  }).replace(/[ \t]+([.,;:!?])/g, "$1").trim();
  return { answer: text, cited: order.map((i, k) => ({ n: k + 1, kind: sources[i].kind, title: sources[i].title, link: sources[i].link })) };
}
