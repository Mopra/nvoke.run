// How much two written emails share (docs/sending/plan.md, "Writing"). Pure.
// Two cold emails in one batch must not read like one template: no shared
// sentence, and at most a fifth of their word trigrams in common. Subjects
// must not repeat either.

/** Above this share of shared trigrams, two bodies read like one template. */
export const MAX_OVERLAP = 0.2;
/** A sentence with this many words or more counts as shared when most of it is in the other email. */
const SHARED_SENTENCE_WORDS = 7;
/** The share of a sentence's trigrams found in the other email that makes it shared. */
const SHARED_SENTENCE_SHARE = 0.6;
/** Subjects whose word sets overlap this much (Jaccard) are near duplicates. */
const SUBJECT_JACCARD = 0.6;

/** Lowercased words, apostrophes kept inside words. */
export function words(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []);
}

/** The set of word trigrams of a text. */
export function trigrams(text: string): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

/** The sentences of a body: split after . ? ! and at line breaks. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function shared(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/**
 * Trigram containment: the shared trigrams over the smaller email's
 * trigrams, 0 to 1. Stricter than Jaccard, so a short email cannot hide
 * inside a long one.
 */
export function overlap(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  const min = Math.min(ta.size, tb.size);
  return min === 0 ? 0 : shared(ta, tb) / min;
}

/** The sentences of `a` that are mostly in `b`, as `a` has them. Short ones (a greeting) do not count. */
export function sharedSentences(a: string, b: string): string[] {
  const tb = trigrams(b);
  return sentences(a).filter((s) => {
    if (words(s).length < SHARED_SENTENCE_WORDS) return false;
    const ts = trigrams(s);
    return ts.size > 0 && shared(ts, tb) / ts.size >= SHARED_SENTENCE_SHARE;
  });
}

export interface Conflict {
  /** Highest trigram overlap with any earlier email. */
  score: number;
  /** Sentences of the new email found in an earlier one. */
  sentences: string[];
  /** The earlier subject the new one repeats, if any. */
  subject: string | null;
}

/** Whether two subjects are the same or nearly: equal once normalized, or most of their words in common. */
export function similarSubjects(a: string, b: string): boolean {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return false;
  if ([...wa].join(' ') === [...wb].join(' ')) return true;
  const inter = shared(wa, wb);
  return inter / (wa.size + wb.size - inter) >= SUBJECT_JACCARD;
}

/**
 * How a new email clashes with earlier ones, or null when it does not: a
 * trigram overlap above MAX_OVERLAP, a shared sentence, or a repeated
 * subject.
 */
export function conflictWith(email: { subject: string; body: string }, earlier: Array<{ subject: string; body: string }>): Conflict | null {
  let score = 0;
  const found = new Set<string>();
  let subject: string | null = null;
  for (const e of earlier) {
    const s = overlap(email.body, e.body);
    if (s > score) score = s;
    for (const line of sharedSentences(email.body, e.body)) found.add(line);
    if (!subject && similarSubjects(email.subject, e.subject)) subject = e.subject;
  }
  if (score <= MAX_OVERLAP && found.size === 0 && !subject) return null;
  return { score, sentences: [...found], subject };
}
