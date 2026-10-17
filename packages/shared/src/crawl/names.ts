// Telling a company's own website from the rest of a web search's results by
// its name: the domains search looks up company names, the local search
// looks up places that list no website (docs/SPEC.md, "Search kinds").

import { isPlatformDomain, isWebmailDomain, normalizeDomain, registrableDomain } from './domain.ts';

/** Words that say what a company is, not which one. */
const LEGAL_WORDS = new Set([
  'a', 'ab', 'ag', 'and', 'aps', 'as', 'asa', 'bv', 'co', 'company', 'corp', 'corporation', 'gmbh', 'group', 'holding',
  'inc', 'incorporated', 'is', 'ivs', 'kg', 'limited', 'llc', 'llp', 'ltd', 'nv', 'oy', 'oyj', 'plc', 'pty', 's', 'sa',
  'sarl', 'sas', 'se', 'sl', 'spa', 'srl', 'the', 'og',
]);

/** "Mærsk A/S" becomes ["maersk"]. Danish and German letters spelled the way domains spell them. */
export function nameTokens(name: string): string[] {
  const folded = name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  return folded.split(/[^a-z0-9]+/).filter((t) => t.length > 0 && !LEGAL_WORDS.has(t));
}

/** The label a domain is known by: "shop.acme.co.uk" gives "acme". */
function brandLabel(domain: string): string {
  return registrableDomain(domain).split('.')[0] ?? domain;
}

/** A folded name as written, and with "oe", "aa" and "ae" read as one letter (sostrenegrene.com). */
function spellings(text: string): string[] {
  return [text, text.replace(/oe/g, 'o').replace(/aa/g, 'a').replace(/ae/g, 'a')];
}

/**
 * How much a domain looks like a company name: 3 when the brand label is the
 * whole name run together (with "oe" also read as "o", so "Søstrene Grene"
 * matches sostrenegrene.com), 2 when it holds all of it or the name holds the
 * label, 1 when it holds the first word, 0 otherwise.
 */
export function nameMatch(name: string, domain: string): number {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return 0;
  const label = brandLabel(domain).replace(/-/g, '');
  const variants = spellings(tokens.join(''));
  if (variants.includes(label)) return 3;
  if (variants.some((v) => label.includes(v) || (label.length >= 4 && v.includes(label)))) return 2;
  const first = tokens[0]!;
  if (first.length >= 3 && label.includes(first)) return 1;
  return 0;
}

/** A search result that might be a company's website. */
export interface SiteCandidate {
  website: string;
}

/** Whether a domain can be anybody's own website at all: not a platform, directory or webmail. */
export function isOwnSiteDomain(domain: string): boolean {
  return !isPlatformDomain(domain) && !isWebmailDomain(domain);
}

/**
 * How much a domain looks like a place's own: 3 when the brand label is the
 * whole name run together, 2 when it holds every distinctive word of the
 * name, 0 otherwise. `generic` words (the niche, the city) say what and where
 * the place is, not which one, so the label need not hold them: "Tandlæge
 * Jensen" in Aarhus matches jensen-tand.dk. A name of only generic words
 * matches nothing but itself run together, and a short distinctive word
 * (under 4 letters) has to be the whole label, since "bo" is in half the
 * domains of Denmark.
 */
export function placeMatch(name: string, domain: string, generic: string[] = []): number {
  if (nameMatch(name, domain) === 3) return 3;
  const skip = new Set(generic.flatMap(nameTokens));
  const words = nameTokens(name).filter((t) => !skip.has(t));
  if (words.length === 0) return 0;
  const label = brandLabel(domain).replace(/-/g, '');
  const labels = spellings(label);
  const holds = (word: string) =>
    spellings(word).some((w) => (word.length >= 4 ? labels.some((l) => l.includes(w)) : labels.includes(w)));
  return words.every(holds) ? 2 : 0;
}

/**
 * A place's own website among search results for its name and city, or null.
 * Unlike a company name lookup there is no fallback to the top result: for a
 * dentist's name the top results are directories and review sites as often
 * as not, and a wrong website crawls somebody else's addresses.
 */
export function pickPlaceSite<T extends SiteCandidate>(name: string, results: T[], generic: string[] = []): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const r of results) {
    const domain = normalizeDomain(r.website);
    if (!domain || !isOwnSiteDomain(domain)) continue;
    const score = placeMatch(name, domain, generic);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}
