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

/** Schools, universities and governments: never a shop's or a practice's own site. */
const INSTITUTION = /(^|\.)(edu|gov|mil)(\.[a-z]{2})?$|\.(ac|gv)\.[a-z]{2}$/;

/** Small words of the languages nvoke searches in, left out of a place's name. */
const STOP_WORDS = new Set([
  'i', 'pa', 'paa', 'til', 'af', 'av', 'en', 'et', 'ved', 'of', 'at', 'in', 'on', 'by', 'to', 'for', 'de', 'der', 'den',
  'det', 'die', 'das', 'und', 'am', 'im', 'zu', 'van', 'het', 'op', 'la', 'le', 'les', 'el', 'del', 'y', 'e', 'och', 'med',
]);

/**
 * How much a domain looks like a place's own: 3 when the brand label is the
 * whole name run together, 2 when it holds every distinctive word of the
 * name or at least two of them, 0 otherwise. `generic` words (the niche, the
 * city) say what and where the place is, not which one, so the label need
 * not hold them, nor their plural and definite forms ("tandlægerne" after
 * "tandlæge"): "Tandlæge Jensen" in Aarhus matches jensen-tand.dk. Stop
 * words ("i", "på", "van") are left out too. A name of only generic words
 * matches nothing but itself run together. A name with one distinctive word
 * matches a label that starts with it or holds nothing else but a generic
 * word ("Lundquist", lundquiststudio.dk; "Tandlægerne i Vesterbrogade",
 * tandlaegerne-vesterbrogade.dk; not "Osteria", losteria.net), and a word
 * under 4 letters has to be the whole label, since "bo" is in half the
 * domains of Denmark. A name of two words or more also matches a label
 * that holds it run together ("In-Shape", in-shapefysiotherapie.nl).
 */
export function placeMatch(name: string, domain: string, generic: string[] = []): number {
  if (INSTITUTION.test(domain)) return 0;
  if (nameMatch(name, domain) === 3) return 3;
  const tokens = nameTokens(name);
  const labels = spellings(brandLabel(domain).replace(/-/g, ''));
  if (tokens.length >= 2 && spellings(tokens.join('')).some((v) => labels.some((l) => l.includes(v)))) return 2;
  const skip = generic.flatMap(nameTokens);
  const isGeneric = (t: string) => skip.some((g) => t === g || (g.length >= 5 && t.startsWith(g) && t.length - g.length <= 4));
  const words = tokens.filter((t) => !STOP_WORDS.has(t) && !isGeneric(t));
  if (words.length === 0) return 0;
  const alone = (l: string, w: string) => {
    if (l.startsWith(w)) return true;
    const at = l.indexOf(w);
    const rest = at < 0 ? '' : l.slice(0, at) + l.slice(at + w.length);
    return rest.length > 0 && isGeneric(rest);
  };
  const holds = (word: string) =>
    spellings(word).some((w) =>
      word.length < 4 ? labels.includes(w) : labels.some((l) => (words.length === 1 ? alone(l, w) : l.includes(w))),
    );
  const held = words.filter(holds);
  return held.length === words.length || held.filter((w) => w.length >= 4).length >= 2 ? 2 : 0;
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

/** Page labels and section titles that name no company: "Website:", "Services Offered", "Home". */
const PAGE_LABELS = new Set([
  'about', 'about us', 'blog', 'contact', 'contact us', 'home', 'home page', 'homepage', 'index', 'login', 'log in',
  'main page', 'news', 'our services', 'our work', 'page not found', 'portfolio', 'pricing', 'products', 'services',
  'services offered', 'sign in', 'site', 'start', 'untitled', 'web site', 'website', 'welcome', 'work', '404',
]);

/** Words a sentence holds and a company name rarely does: a post title, a question, a tagline. */
const SENTENCE_WORDS = new Set([
  'i', 'my', 'me', 'we', 'our', 'you', 'your', 'how', 'why', 'what', 'when', 'who', 'is', 'are', 'was', 'runs', 'run',
  'can', 'will', 'that', 'this', 'which', 'on', 'to', 'with', 'in', 'from', 'at', 'by',
]);

/** "acme-dental.dk" becomes "Acme Dental". */
export function nameFromDomainLabel(domain: string): string {
  return brandLabel(normalizeDomain(domain) ?? domain)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Whether a piece of a title reads as a company name, not a label, a tagline or a post title. */
function nameLike(text: string, matchesDomain: boolean): boolean {
  if (text.length < 2 || text.length > 60) return false;
  if (/[:?!]$/.test(text) || /^[\d\W]+$/.test(text)) return false;
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  if (PAGE_LABELS.has(lower)) return false;
  const words = lower.split(' ');
  const sentence = words.filter((w) => SENTENCE_WORDS.has(w)).length;
  if (matchesDomain) return words.length <= 8 && sentence <= 1;
  return words.length <= 5 && sentence === 0;
}

/**
 * A company's name from what a search result or homepage calls it, tried in
 * order (a site name, then the page title), else from its domain. Titles
 * split on their separators; the piece that names the domain wins, else the
 * first that reads as a name. Labels ("Website:"), taglines and post titles
 * ("My design portfolio runs on a fake PS1 renderer") are never a name.
 */
export function companyNameFrom(texts: (string | null | undefined)[], domain: string): string {
  const label = brandLabel(normalizeDomain(domain) ?? domain).replace(/[^a-z0-9]/g, '');
  for (const text of texts) {
    const parts = (text ?? '')
      .replace(/<[^>]+>/g, '')
      .split(/\s+[|\u2013\u2014\u00b7\u2022-]\s+|\s*\|\s*|:\s+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const matches = (p: string) => label.length >= 3 && p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(label);
    const named = parts.find((p) => matches(p) && nameLike(p, true)) ?? parts.find((p) => nameLike(p, false));
    if (named) return named;
  }
  return nameFromDomainLabel(domain);
}
