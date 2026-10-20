// A company's website from its name, for free, before a paid web search.
//
// A `domains` search pays Brave one request per company name and a `local`
// search one per place without a website (docs/SPEC.md, "Source costs").
// This tries three free routes first and answers only when confident, else
// null, and the caller asks Brave as before:
//
// 1. Known: a company of the same name that a past search found, whose
//    domain the crawl reached (`companies` joined to `domains`).
// 2. Guess: domains made from the name ("Acme Dental ApS" gives
//    acmedental.dk, acme-dental.dk, acmedental.com), resolved in DNS, and the
//    first that resolve fetched like the crawl does (robots.txt, the per host
//    rate, nvokebot). The page must carry the name as its brand (title,
//    og:site_name, a logo, the copyright line) and not be a parked domain.
// 3. Wikidata: the official website (P856) of an item whose label is the
//    name, only for distinctive names and only when one item answers.

import { promises as dns } from 'node:dns';
import { load } from 'cheerio';
import type { Sql } from 'postgres';
import type { Logger } from 'pino';
import { isOwnSiteDomain, nameMatch, nameTokens, normalizeDomain, placeMatch, registrableDomain } from '../domain.js';
import { isHtml, SiteFetcher, type CrawlDeps } from '../crawl.js';
import { BOT_USER_AGENT, HttpError, decodeBody, fetchJson, type FetchLike } from '../http.js';
import { RateLimiter } from '../limits.js';
import { pageText } from '../page-text.js';
import { RobotsCache } from '../robots.js';

/** The free route that found a website. */
export type NameRoute = 'known' | 'guess' | 'wikidata';

/** Names resolved per route, plus those Brave found and those nothing found, for the logs. */
export type NameRouteCounts = Record<NameRoute | 'brave' | 'none', number>;

export function emptyRouteCounts(): NameRouteCounts {
  return { known: 0, guess: 0, wikidata: 0, brave: 0, none: 0 };
}

export interface NameQuery {
  name: string;
  /** ISO 3166-1 alpha-2, lowercase. Its TLD is guessed first. */
  country?: string;
  /** For a place: the town it is in. Known rows and guessed pages must name it. */
  city?: string;
  /** Words that say what or where a place is, not which one: the niche, the city. */
  generic?: string[];
}

export interface ResolvedName {
  domain: string;
  website: string;
  route: NameRoute;
}

export interface NameResolver {
  resolve(query: NameQuery, ctx: { signal: AbortSignal; log: Logger }): Promise<ResolvedName | null>;
}

export interface NameResolverOptions {
  /** For the known route; without it the route is skipped. */
  sql?: Sql;
  /** The crawl's rate limiter and robots.txt cache, so guesses share the per host rate. */
  crawl?: CrawlDeps;
  /** For Wikidata, and for pages when `crawl` is not given. */
  fetch?: FetchLike;
  /** True when the host has an address. Default: DNS, A then AAAA. */
  lookupHost?: (host: string) => Promise<boolean>;
  /** False turns the Wikidata route off. */
  wikidata?: boolean;
  wikidataUrl?: string;
  /** Spacing of Wikidata requests. Default one a second for the process. */
  wikidataLimiter?: RateLimiter;
  /** DNS lookups per name. Default MAX_GUESS_LOOKUPS. */
  maxLookups?: number;
  /** Homepages fetched per name. Default MAX_GUESS_FETCHES. */
  maxFetches?: number;
}

export const MAX_GUESS_LOOKUPS = 6;
export const MAX_GUESS_FETCHES = 2;
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
/** Bytes read of a guessed homepage. */
const GUESS_MAX_BYTES = 1_000_000;
const DNS_TIMEOUT_MS = 3_000;
/** After Wikidata refuses us (429, 503), it rests this long. */
const WIKIDATA_PAUSE_MS = 10 * 60_000;

// Shared by every search in the process, per the Wikidata API etiquette.
const sharedWikidataLimiter = new RateLimiter(1_000);
let wikidataPausedUntil = 0;

export function nameResolver(opts: NameResolverOptions = {}): NameResolver {
  let crawl = opts.crawl;
  if (!crawl) {
    const limiter = new RateLimiter(1_000);
    crawl = { fetch: opts.fetch, limiter, robots: new RobotsCache({ fetch: opts.fetch, limiter }) };
  }
  const deps = crawl;
  const lookupHost = opts.lookupHost ?? dnsLookup;
  return {
    async resolve(query, ctx) {
      const tokens = nameTokens(query.name);
      if (tokens.length === 0) return null;
      const routes: Array<[NameRoute, () => Promise<string | null>]> = [
        ['known', async () => (opts.sql ? knownDomain(opts.sql, query) : null)],
        ['guess', () => guessDomain(query, { deps, lookupHost, signal: ctx.signal, maxLookups: opts.maxLookups, maxFetches: opts.maxFetches })],
        [
          'wikidata',
          async () =>
            opts.wikidata === false
              ? null
              : wikidataDomain(query, {
                  url: opts.wikidataUrl ?? WIKIDATA_API,
                  fetch: opts.fetch,
                  limiter: opts.wikidataLimiter ?? sharedWikidataLimiter,
                  signal: ctx.signal,
                }),
        ],
      ];
      for (const [route, run] of routes) {
        try {
          const domain = await run();
          if (domain) return { domain, website: `https://${domain}/`, route };
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          ctx.log.debug({ err: err instanceof Error ? err.message : String(err), name: query.name, route }, 'resolve name: route failed');
        }
      }
      return null;
    },
  };
}

// Words

/** Small words left out of a place's name when telling how distinctive it is. */
const STOP_WORDS = new Set(['i', 'pa', 'paa', 'til', 'af', 'en', 'et', 'ved', 'of', 'at', 'in', 'on', 'by', 'for', 'de', 'der', 'den', 'det', 'die', 'das', 'und', 'van', 'la', 'le', 'el', 'y', 'e', 'og', 'med']);

/** The words of a name that tell which company it is: not legal, generic or stop words. */
export function distinctiveWords(name: string, generic: string[] = []): string[] {
  const skip = generic.flatMap(nameTokens);
  const isGeneric = (t: string) => skip.some((g) => t === g || (g.length >= 5 && t.startsWith(g) && t.length - g.length <= 4));
  return nameTokens(name).filter((t) => !STOP_WORDS.has(t) && !isGeneric(t));
}

/** The name as a domain label with "oe", "aa" and "ae" read as one letter too (sostrenegrene). */
function oneLetter(text: string): string {
  return text.replace(/oe/g, 'o').replace(/aa/g, 'a').replace(/ae/g, 'a');
}

// Known: our own data

/** Legal endings a stored name may carry that the asked name lacks, or the other way round. */
const LEGAL_ENDINGS = ['aps', 'a/s', 'as', 'ab', 'ag', 'bv', 'b.v.', 'gmbh', 'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'limited', 'oy', 'plc', 'sa', 'sarl', 'srl', 'ivs', 'corp', 'corp.'];
const LEGAL_ENDING = new RegExp(`[\\s,]+(${LEGAL_ENDINGS.map((e) => e.replace(/[./]/g, (c) => `\\${c}`)).join('|')})$`);

/** Lowercased spellings of a name as a company row may store it, for the lower(name) index. */
export function storedNameVariants(name: string): string[] {
  const base = name.trim().toLowerCase().replace(/\s+/g, ' ');
  let core = base;
  while (LEGAL_ENDING.test(core)) core = core.replace(LEGAL_ENDING, '').trim();
  const out = new Set([base, core]);
  for (const ending of LEGAL_ENDINGS) {
    out.add(`${core} ${ending}`);
    out.add(`${core}, ${ending}`);
  }
  return [...out].filter(Boolean);
}

/** The TLD a country's companies register under, or null when they mostly use .com. */
export function countryTld(country?: string): string | null {
  const cc = country?.toLowerCase();
  if (!cc || !/^[a-z]{2}$/.test(cc) || cc === 'us') return null;
  const special: Record<string, string> = {
    gb: 'co.uk', uk: 'co.uk', au: 'com.au', nz: 'co.nz', jp: 'co.jp', za: 'co.za', br: 'com.br', mx: 'com.mx',
    ar: 'com.ar', tr: 'com.tr', il: 'co.il', kr: 'co.kr', sg: 'com.sg', my: 'com.my', cn: 'com.cn',
  };
  return special[cc] ?? cc;
}

function hasTld(domain: string, tld: string): boolean {
  return domain.endsWith(`.${tld}`);
}

/** Whether a town appears in a text, as its first word ("Austin" of "Austin, Texas"). */
function mentionsCity(text: string, city: string): boolean {
  const first = nameTokens(city)[0];
  if (!first) return true;
  const words = new Set(nameTokens(text));
  return words.has(first) || words.has(oneLetter(first));
}

/**
 * The domain past searches found for this name, when they agree. A row
 * counts when OpenStreetMap listed the website, or when the domain holds
 * the name; a row from a Brave fallback that does not look like the name
 * proves nothing. The crawl must have reached the domain. With a city the
 * row's address must name it: two dentists called Jensen are two companies.
 */
export async function knownDomain(sql: Sql, query: NameQuery): Promise<string | null> {
  const rows = await sql<{ name: string; domain: string; source: string; location: string | null }[]>`
    select c.name, c.domain, c.source, c.location
    from companies c
    join domains d on d.domain = c.domain
    where lower(c.name) = any(${sql.array(storedNameVariants(query.name))})
      and d.crawl_status in ('done', 'refused', 'js_only')
    order by c.created_at desc
    limit 50
  `;
  const key = nameTokens(query.name).join(' ');
  const domains = new Set<string>();
  for (const row of rows) {
    if (nameTokens(row.name).join(' ') !== key || !isOwnSiteDomain(row.domain)) continue;
    if (query.city && !(row.location && mentionsCity(row.location, query.city))) continue;
    const looksLikeName = query.generic ? placeMatch(query.name, row.domain, query.generic) >= 2 : nameMatch(query.name, row.domain) >= 2;
    if (row.source !== 'osm' && !looksLikeName) continue;
    domains.add(row.domain);
  }
  return pickOne(domains, query.country);
}

/** The one domain of a set, or the one under the country's TLD, or null when they disagree. */
function pickOne(domains: Set<string>, country?: string): string | null {
  if (domains.size === 1) return [...domains][0]!;
  const tld = countryTld(country);
  const local = tld ? [...domains].filter((d) => hasTld(d, tld)) : [];
  return local.length === 1 ? local[0]! : null;
}

// Guess: domains made from the name

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const OTHER_TLDS = ['com', 'net', 'io', 'co', 'org'];

/** Domains to try for a name, most likely first: the country's TLD, then .com and the rest. */
export function guessHosts(name: string, country: string | undefined, max: number): string[] {
  const tokens = nameTokens(name);
  const joined = tokens.join('');
  // "Bo" or "ICA" as a domain is anybody's.
  if (joined.length < 4) return [];
  const slugs = [...new Set([joined, tokens.join('-'), oneLetter(joined)])].filter((s) => LABEL.test(s));
  const cc = countryTld(country);
  const tlds = [...new Set([...(cc ? [cc] : []), ...OTHER_TLDS])];
  const out: string[] = [];
  for (const tld of tlds) for (const slug of slugs) out.push(`${slug}.${tld}`);
  return out.slice(0, max);
}

async function dnsLookup(host: string): Promise<boolean> {
  const resolver = new dns.Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
  for (const kind of ['resolve4', 'resolve6'] as const) {
    try {
      if ((await resolver[kind](host)).length > 0) return true;
    } catch {
      // NXDOMAIN, no records of this kind or a timeout: try the other kind, then give up.
    }
  }
  return false;
}

/** Hosts of domain parking and for-sale services: a guess that lands there is not the company. */
const PARKING_HOSTS = new Set([
  'sedo.com', 'sedoparking.com', 'parkingcrew.net', 'bodis.com', 'above.com', 'dan.com', 'afternic.com', 'hugedomains.com',
  'godaddy.com', 'namecheap.com', 'undeveloped.com', 'buydomains.com', 'domainmarket.com', 'squadhelp.com', 'atom.com',
  'sav.com', 'porkbun.com', 'parklogic.com', 'domainnamesales.com', 'epik.com', 'dynadot.com', 'namebright.com',
]);

export function isParkingHost(domain: string): boolean {
  return PARKING_HOSTS.has(registrableDomain(domain));
}

const PARKED_TEXT =
  /domain (name )?(is|may be|might be) for sale|buy this domain|this domain (name )?(is|has been) (parked|registered|for sale)|parked (free|domain|by)|domain parking|this (web )?page is parked|sedoparking|parkingcrew|bodis\.com|afternic|hugedomains|make an offer on this domain|domæne(t)? er til salg|domain steht zum verkauf|domain kaufen/i;

/** A page that parks the domain or offers it for sale. */
export function isParkedPage(html: string): boolean {
  return PARKED_TEXT.test(html);
}

/** "acme.com", "www.acme.dk": a host name in a title says nothing about the brand. */
const HOST_IN_TEXT = /\b(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
/** Title separators: "Acme | Home", "Home - Acme", "Acme · Dental". */
const SEPARATORS = /\s+[-\u2013\u2014:|\u00b7\u2022\u00bb/]\s+|\s*[|\u00b7\u2022\u00bb]\s*/;
const COPYRIGHT = /(?:\u00a9|&copy;|\(c\)|copyright)\s*(?:\d{4}(?:\s*[-\u2013]\s*\d{2,4})?)?\s*,?\s*([^\n|.\u00a9]{2,80})/gi;

/** The texts a site names itself by: site name, title, top heading, logo, copyright holder. */
export function brandTexts(html: string): string[] {
  const $ = load(html);
  const meta = (sel: string) => $(sel).attr('content') ?? '';
  const texts = [
    meta('meta[property="og:site_name"]'),
    meta('meta[name="application-name"]'),
    $('title').first().text(),
    meta('meta[property="og:title"]'),
    $('h1').first().text(),
  ];
  $('img[alt]').each((_, el) => {
    const img = $(el);
    const hint = `${img.attr('class') ?? ''} ${img.attr('id') ?? ''} ${img.attr('src') ?? ''} ${img.attr('alt') ?? ''} ${img.parent().attr('class') ?? ''}`;
    if (/logo/i.test(hint)) texts.push((img.attr('alt') ?? '').replace(/\blogo\b/gi, ''));
  });
  $('script, style, noscript').remove();
  const body = $('body').text().replace(/\s+/g, ' ');
  for (const m of body.matchAll(COPYRIGHT)) {
    texts.push((m[1] ?? '').replace(/\b(all rights reserved|alle rettigheder forbeholdes)\b.*$/i, ''));
    if (texts.length > 40) break;
  }
  return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Whether a page carries the name as its brand. A part of a brand text
 * (split at title separators) must be the name, run together or not. A name
 * of two distinctive words or more may also sit inside a part ("Welcome to
 * Acme Dental"); one word must be a part of its own, since "Lunar" is in
 * "Lunar Eclipse Photography" too.
 */
export function brandMatches(name: string, html: string, generic: string[] = []): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const joined = tokens.join('');
  const runs = new Set([joined, oneLetter(joined)]);
  const long = distinctiveWords(name, generic).length >= 2;
  for (const text of brandTexts(html)) {
    for (const part of text.replace(HOST_IN_TEXT, ' ').split(SEPARATORS)) {
      const words = nameTokens(part);
      if (words.length === 0) continue;
      if (runs.has(words.join('')) || runs.has(oneLetter(words.join('')))) return true;
      if (long && containsRun(words, tokens)) return true;
    }
  }
  return false;
}

function containsRun(words: string[], run: string[]): boolean {
  for (let i = 0; i + run.length <= words.length; i++) {
    if (run.every((t, j) => words[i + j] === t || oneLetter(words[i + j]!) === oneLetter(t))) return true;
  }
  return false;
}

interface GuessOptions {
  deps: CrawlDeps;
  lookupHost: (host: string) => Promise<boolean>;
  signal: AbortSignal;
  maxLookups?: number;
  maxFetches?: number;
}

/**
 * A guessed domain whose homepage carries the name, or null. Names of only
 * generic words ("Tandlægerne") are not guessed: their domain is anybody's.
 */
export async function guessDomain(query: NameQuery, opts: GuessOptions): Promise<string | null> {
  if (distinctiveWords(query.name, query.generic).length === 0) return null;
  const hosts = guessHosts(query.name, query.country, opts.maxLookups ?? MAX_GUESS_LOOKUPS);
  // Lookups are cheap and run together; fetches are spent in order of likelihood.
  const resolves = await Promise.all(hosts.map((h) => opts.lookupHost(h).catch(() => false)));
  let fetches = 0;
  for (const [i, host] of hosts.entries()) {
    if (!resolves[i]) continue;
    if (fetches >= (opts.maxFetches ?? MAX_GUESS_FETCHES)) break;
    fetches++;
    const domain = await confirmSite(host, query, opts);
    if (domain) return domain;
  }
  return null;
}

/** Fetches a guessed homepage the way the crawl does and returns its domain when the page is the company's. */
async function confirmSite(host: string, query: NameQuery, opts: GuessOptions): Promise<string | null> {
  const fetcher = new SiteFetcher(opts.deps, GUESS_MAX_BYTES, opts.signal);
  const res = await fetcher.get(`https://${host}/`, GUESS_MAX_BYTES);
  if (res.kind !== 'ok' || res.status !== 200 || !isHtml(res.contentType)) return null;
  // A redirect may land on the company's real domain (acme.dk to acme-group.com), or on a platform or a parking lot.
  const domain = normalizeDomain(res.url);
  if (!domain || !isOwnSiteDomain(domain) || isParkingHost(domain)) return null;
  const html = decodeBody(res.body, res.contentType);
  if (isParkedPage(html) || !brandMatches(query.name, html, query.generic)) return null;
  if (query.city) {
    const page = pageText(html, res.url, 50_000);
    if (!mentionsCity(`${page.title}\n${page.text}`, query.city)) return null;
  }
  return domain;
}

// Wikidata

/** The language Wikidata labels are searched in, per country. English elsewhere. */
const WIKIDATA_LANGUAGE: Record<string, string> = {
  dk: 'da', de: 'de', at: 'de', ch: 'de', se: 'sv', no: 'nb', fi: 'fi', fr: 'fr', be: 'fr', nl: 'nl', es: 'es', it: 'it',
  pl: 'pl', pt: 'pt', br: 'pt',
};

/** Classes whose items share names with companies but are not one: people, works, bands. */
const NOT_A_COMPANY = new Set(['Q5', 'Q215380', 'Q482994', 'Q134556', 'Q11424', 'Q5398426', 'Q7725634', 'Q571', 'Q7889', 'Q4167410', 'Q13442814', 'Q101352']);

interface WikidataSearch {
  search?: Array<{ id: string; label?: string; match?: { text?: string } }>;
}

interface WikidataClaim {
  rank?: string;
  mainsnak?: { datavalue?: { value?: unknown } };
}

interface WikidataEntities {
  entities?: Record<string, { claims?: Record<string, WikidataClaim[]> }>;
}

/** A name is distinctive enough for Wikidata when its telling words run to 6 letters or more. */
export function isDistinctive(name: string, generic: string[] = []): boolean {
  return distinctiveWords(name, generic).join('').length >= 6;
}

function claimValues(claims: WikidataClaim[] | undefined): unknown[] {
  const live = (claims ?? []).filter((c) => c.rank !== 'deprecated');
  const preferred = live.filter((c) => c.rank === 'preferred');
  return (preferred.length > 0 ? preferred : live).map((c) => c.mainsnak?.datavalue?.value).filter((v) => v !== undefined);
}

interface WikidataOptions {
  url: string;
  fetch?: FetchLike;
  limiter: RateLimiter;
  signal: AbortSignal;
}

async function wikidataGet<T>(params: Record<string, string>, opts: WikidataOptions): Promise<T | null> {
  if (Date.now() < wikidataPausedUntil) return null;
  await opts.limiter.wait('wikidata', opts.signal);
  const url = new URL(opts.url);
  for (const [k, v] of Object.entries({ ...params, format: 'json', maxlag: '5' })) url.searchParams.set(k, v);
  try {
    return await fetchJson<T>(url.toString(), { fetch: opts.fetch, signal: opts.signal, timeoutMs: 10_000, maxBytes: 2_000_000, headers: { 'user-agent': BOT_USER_AGENT } });
  } catch (err) {
    if (err instanceof HttpError && (err.status === 429 || err.status === 503 || err.status === 403)) wikidataPausedUntil = Date.now() + WIKIDATA_PAUSE_MS;
    throw err;
  }
}

/**
 * The official website of the one Wikidata item labeled with the name, or
 * null. Items that are people, works or bands are left out, and the website
 * must hold the name: Wikidata knows many things called "Monday".
 */
export async function wikidataDomain(query: NameQuery, opts: WikidataOptions): Promise<string | null> {
  if (!isDistinctive(query.name, query.generic)) return null;
  const language = WIKIDATA_LANGUAGE[query.country?.toLowerCase() ?? ''] ?? 'en';
  const found = await wikidataGet<WikidataSearch>(
    { action: 'wbsearchentities', search: query.name.trim(), language, uselang: language, type: 'item', limit: '7' },
    opts,
  );
  const key = nameTokens(query.name).join(' ');
  const ids = (found?.search ?? [])
    .filter((hit) => [hit.label, hit.match?.text].some((t) => t && nameTokens(t).join(' ') === key))
    .map((hit) => hit.id)
    .filter((id) => /^Q\d+$/.test(id))
    .slice(0, 5);
  if (ids.length === 0) return null;
  const items = await wikidataGet<WikidataEntities>({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims' }, opts);
  const domains = new Set<string>();
  for (const id of ids) {
    const claims = items?.entities?.[id]?.claims;
    if (!claims) continue;
    const classes = claimValues(claims.P31).map((v) => (v as { id?: string }).id);
    if (classes.some((c) => c && NOT_A_COMPANY.has(c))) continue;
    for (const site of claimValues(claims.P856)) {
      const domain = typeof site === 'string' ? normalizeDomain(site) : null;
      if (domain && isOwnSiteDomain(domain) && nameMatch(query.name, domain) >= 2) domains.add(domain);
    }
  }
  return pickOne(domains, query.country);
}

/** For tests: forget a Wikidata pause. */
export function resetWikidataPause(): void {
  wikidataPausedUntil = 0;
}
