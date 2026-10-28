// How much two written emails share (docs/sending/plan.md, "Writing"). Pure.
// Two cold emails in one batch must not read like one template: no shared
// sentence, and at most a fifth of their word trigrams in common. Subjects
// must not repeat either. Sentences made of the sender's own offer words
// (its prices, pitch and briefs) are left out of the comparison, and so are
// word runs of offer words and dates beyond glue words: every email of a campaign
// states the same offer in its own words ("Mailchimp bills by subscriber
// count"), and that is not a template.

/** Above this share of shared trigrams, two bodies read like one template. */
export const MAX_OVERLAP = 0.2;
/** A sentence with this many words or more counts as shared when most of it is in the other email. */
const SHARED_SENTENCE_WORDS = 7;
/** The share of a sentence's trigrams found in the other email that makes it shared. */
const SHARED_SENTENCE_SHARE = 0.6;
/** Subjects whose word sets overlap this much (Jaccard) are near duplicates. */
const SUBJECT_JACCARD = 0.6;
/** A sentence with at least this share of its words in the offer's words is the offer's, not the email's own. */
const OFFER_SHARE = 0.75;

/** Lowercased words, apostrophes kept inside words. */
export function words(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []);
}

const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
/** Words every sentence has, which never make a run the offer's own. */
const GLUE = new Set(
  'a an and are as at be been but by can do does for from has have i if in is it its me my no not of on or so that the their them they this to was we what when which who will with would you your'.split(' '),
);

/** Whether a word is the offer's own or part of a date or number, which every email may share. */
function common(word: string, offer: Set<string>): boolean {
  return offer.has(word) || MONTHS.has(word) || /^\d+(st|nd|rd|th)?$/.test(word);
}

/**
 * Whether a trigram is the offer's or a date's, not the email's: all its
 * words common and at least one more than glue ("by subscriber count",
 * "november 4 2026", but never "and it has").
 */
function offerRun(trigram: string, offer: Set<string> | undefined): boolean {
  if (!offer?.size) return false;
  const w = trigram.split(' ');
  return w.every((x) => common(x, offer)) && w.some((x) => !GLUE.has(x));
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

/** How many trigrams of `a` are in `b`, those made only of `offer` words and dates aside. */
function shared(a: Set<string>, b: Set<string>, offer?: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t) && !offerRun(t, offer)) n++;
  return n;
}

/**
 * Trigram containment: the shared trigrams over the smaller email's
 * trigrams, 0 to 1. Stricter than Jaccard, so a short email cannot hide
 * inside a long one.
 */
export function overlap(a: string, b: string, offer?: Set<string>): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  const min = Math.min(ta.size, tb.size);
  return min === 0 ? 0 : shared(ta, tb, offer) / min;
}

/** The sentences of `a` that are mostly in `b`, as `a` has them. Short ones (a greeting) do not count. */
export function sharedSentences(a: string, b: string, offer?: Set<string>): string[] {
  const tb = trigrams(b);
  return sentences(a).filter((s) => {
    if (words(s).length < SHARED_SENTENCE_WORDS) return false;
    const ts = trigrams(s);
    return ts.size > 0 && shared(ts, tb, offer) / ts.size >= SHARED_SENTENCE_SHARE;
  });
}

/** The words of the sender's offer text (sender, prices, pitch, campaign, briefs), for withoutOffer. */
export function offerWords(text: string): Set<string> {
  return new Set(words(text));
}

/** Whether a sentence is mostly the offer's own words. */
export function isOfferSentence(sentence: string, offer: Set<string>): boolean {
  const w = words(sentence);
  return w.length > 0 && w.filter((x) => offer.has(x)).length / w.length >= OFFER_SHARE;
}

/** The body without the sentences built from the offer's words. */
export function withoutOffer(text: string, offer: Set<string> | undefined): string {
  if (!offer || offer.size === 0) return text;
  return sentences(text)
    .filter((s) => !isOfferSentence(s, offer))
    .join('\n');
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
 * subject. `offer`, when given, takes the offer's sentences out of both
 * bodies first (withoutOffer) and its word runs out of the trigrams.
 */
export function conflictWith(
  email: { subject: string; body: string },
  earlier: Array<{ subject: string; body: string }>,
  offer?: Set<string>,
): Conflict | null {
  let score = 0;
  const found = new Set<string>();
  let subject: string | null = null;
  const body = withoutOffer(email.body, offer);
  for (const e of earlier) {
    const other = withoutOffer(e.body, offer);
    const s = overlap(body, other, offer);
    if (s > score) score = s;
    for (const line of sharedSentences(body, other, offer)) found.add(line);
    if (!subject && similarSubjects(email.subject, e.subject)) subject = e.subject;
  }
  if (score <= MAX_OVERLAP && found.size === 0 && !subject) return null;
  return { score, sentences: [...found], subject };
}
