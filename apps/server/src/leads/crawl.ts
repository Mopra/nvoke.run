// Crawls one company website for published email addresses and the people
// it names (team, about and imprint pages).
//
// Limits (docs/SPEC.md): the homepage plus likely pages (contact, about,
// team, impressum, privacy, legal) from its links or its sitemap, at most 8
// pages and 2 MB per company, robots.txt honored on every hop, at most one
// request per second per host (longer if robots.txt asks for a Crawl-delay).
// The rules for picking pages and reading addresses live in
// @nvoke/shared/crawl, so the desktop's local crawl follows them too.

import {
  CRAWL_MAX_BYTES,
  CRAWL_MAX_PAGES,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_FILES,
  clientRedirect,
  extractEmails,
  extractPeople,
  fallbackPages,
  hasOwnAddress,
  homepageVariants,
  hostToDomain,
  peoplePageKind,
  withoutQuotes,
  isPlatformDomain,
  looksJsOnly,
  mergePeople,
  pageWall,
  parseSitemap,
  pickLikelyPages,
  planPages,
  rankSitemaps,
  selectForCompany,
  type ExtractedEmail,
  type FoundPerson,
} from '@nvoke/shared/crawl';
import { decodeBody, fetchCapped, type FetchLike } from './http.js';
import { pageText, type SitePage } from './page-text.js';
import type { RateLimiter } from './limits.js';
import type { RobotsCache } from './robots.js';

export { CRAWL_MAX_BYTES, CRAWL_MAX_PAGES, pickLikelyPages };

const MAX_REDIRECTS = 5;
/** Homepage answers that mean "not you" rather than "not here": usually a block on datacenter addresses. */
const REFUSED_STATUSES = new Set([401, 403, 429, 503]);
const PAGE_TIMEOUT_MS = 15_000;
/** Pages whose text is kept for openers, the homepage first, and the text kept of each. */
export const OPENER_PAGES = 3;
export const OPENER_PAGE_TEXT_MAX = 3_000;
/** Email addresses, plain or written out ("ole [at] acme [dot] dk"). Kept text never holds them: the shared cache stores no personal address. */
const ADDRESS_IN_TEXT = /[\p{L}\p{N}_.+-]+(@|\s*[[(]\s*(at|snabel-?a)\s*[\])]\s*)[\p{L}\p{N}_-]+((\.|\s*[[(]\s*(dot|punktum)\s*[\])]\s*)[\p{L}\p{N}_-]+)+/giu;

/** The opener text of a page, without email addresses. */
function openerText(html: string, url: string): SitePage {
  const page = pageText(html, url, OPENER_PAGE_TEXT_MAX);
  const strip = (v: string) =>
    v
      .replace(ADDRESS_IN_TEXT, '')
      .split('\n')
      .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  return { ...page, title: strip(page.title), description: strip(page.description), text: strip(page.text) };
}

/** Visible text of the people pages (team, about, imprint) kept for the people step, all pages together. */
export const PEOPLE_TEXT_MAX = 8_000;

/** Pages that say little about the business, or mostly name people. Their text is not kept for openers. */
const NO_TEXT_PATH = /privacy|privat|legal|impressum|imprint|terms|cookie|datenschutz|gdpr|persondata|kontakt|contact|team|staff|people|medarbejder|mitarbeiter/i;

export interface CrawlDeps {
  fetch?: FetchLike;
  limiter: RateLimiter;
  robots: RobotsCache;
}

export interface CrawlOptions {
  maxPages?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface PageVisit {
  url: string;
  status: number;
  bytes: number;
  /** Set when the page was skipped or failed. */
  note?: 'robots' | 'not_html' | 'error' | 'budget';
}

export interface CrawlResult {
  /**
   * `blocked`: robots.txt keeps us out. `refused`: the site refuses our
   * servers (401, 403, 429 or 503 on the homepage, or a bot challenge).
   * `js_only`: nothing found and the homepage is a JavaScript app shell.
   * The desktop's local render crawl can read the last two (docs/desktop/local-crawl.md).
   */
  status: 'done' | 'failed' | 'blocked' | 'refused' | 'js_only';
  emails: ExtractedEmail[];
  pages: PageVisit[];
  /** Visible text of the homepage and up to two pages about the business, for openers. */
  texts: SitePage[];
  /** The people the pages name, one entry each, decision makers first, at most PEOPLE_MAX. */
  people: FoundPerson[];
  /**
   * Visible text of the team, about and imprint pages, PEOPLE_TEXT_MAX in
   * all, for the people step (src/leads/people-llm.ts). Never cached: it
   * names people and holds their addresses.
   */
  peopleTexts: SitePage[];
  error?: string;
}

export function isHtml(contentType: string | null): boolean {
  if (!contentType) return true;
  return /text\/html|application\/xhtml\+xml|text\/plain|text\/(x-)?vcard|text\/directory/i.test(contentType);
}

export interface Fetched {
  kind: 'ok' | 'robots' | 'error';
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  error?: string;
}

/** Fetches pages of one site within a byte budget. Also reads the site profile (src/profile). */
export class SiteFetcher {
  bytesUsed = 0;

  constructor(
    private readonly deps: CrawlDeps,
    private readonly maxBytes: number,
    private readonly signal?: AbortSignal,
  ) {}

  get budgetLeft(): number {
    return this.maxBytes - this.bytesUsed;
  }

  /** Sitemaps the site's robots.txt declares. */
  async sitemapsFor(url: string): Promise<string[]> {
    return (await this.deps.robots.rulesFor(url, this.signal)).sitemaps ?? [];
  }

  /** GET with manual redirects, so robots.txt and the rate limit apply to every hop. */
  async get(startUrl: string, maxBytes = Infinity): Promise<Fetched> {
    let url = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const rules = await this.deps.robots.rulesFor(url, this.signal);
      if (!rules.isAllowed(url)) {
        // An unreachable robots.txt means we may not crawl, and usually that the site is down.
        if (rules.source === 'unreachable') {
          return { kind: 'error', url, status: 0, contentType: null, body: Buffer.alloc(0), error: 'robots.txt unreachable' };
        }
        return { kind: 'robots', url, status: 0, contentType: null, body: Buffer.alloc(0) };
      }
      await this.deps.limiter.wait(new URL(url).hostname, this.signal, rules.crawlDelayMs);
      let res;
      try {
        res = await fetchCapped(url, {
          fetch: this.deps.fetch,
          maxBytes: Math.max(0, Math.min(maxBytes, this.budgetLeft)),
          timeoutMs: PAGE_TIMEOUT_MS,
          signal: this.signal,
          redirect: 'manual',
          headers: { accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.1' },
        });
      } catch (err) {
        if (this.signal?.aborted) throw err;
        return {
          kind: 'error',
          url,
          status: 0,
          contentType: null,
          body: Buffer.alloc(0),
          error: err instanceof Error ? err.message : String(err),
        };
      }
      this.bytesUsed += res.body.byteLength;
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).toString();
        continue;
      }
      return { kind: 'ok', url, status: res.status, contentType: res.headers.get('content-type'), body: res.body };
    }
    return { kind: 'error', url, status: 0, contentType: null, body: Buffer.alloc(0), error: 'too many redirects' };
  }
}

export async function crawlSite(
  website: string,
  companyDomain: string,
  deps: CrawlDeps,
  opts: CrawlOptions = {},
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? CRAWL_MAX_PAGES;
  const fetcher = new SiteFetcher(deps, opts.maxBytes ?? CRAWL_MAX_BYTES, opts.signal);
  const pages: PageVisit[] = [];
  const found: ExtractedEmail[] = [];
  const people: FoundPerson[] = [];
  const peopleTexts: SitePage[] = [];
  const fetched = () => pages.filter((p) => p.note !== 'robots').length;
  const empty = { emails: [], texts: [], people: [], peopleTexts: [] };
  /** People and the text of a people page, from one page read. */
  const readPeople = (html: string, url: string) => {
    people.push(...extractPeople(html, url));
    if (peoplePageKind(url) && peopleTexts.length < 6) {
      // Without quotes and testimonials: Claude reads only what the company says of its own people.
      const page = pageText(withoutQuotes(html), url, PEOPLE_TEXT_MAX);
      if (page.text) peopleTexts.push(page);
    }
  };

  // Homepage. Small business sites still go without TLS or answer on only
  // one of www and the bare domain, so try those when the given one fails.
  let home: Fetched | null = null;
  for (const url of homepageVariants(website)) {
    home = await fetcher.get(url);
    pages.push(visit(home));
    if (home.kind !== 'error') break;
  }
  if (!home) return { status: 'failed', ...empty, pages, error: 'no homepage' };
  if (home.kind === 'robots') return { status: 'blocked', ...empty, pages };
  if (home.kind === 'ok' && REFUSED_STATUSES.has(home.status)) {
    return { status: 'refused', ...empty, pages, error: `homepage answered ${home.status}` };
  }
  if (home.kind === 'error' || home.status >= 400) {
    return { status: 'failed', ...empty, pages, error: home.error ?? `homepage answered ${home.status}` };
  }

  let homeHtml = isHtml(home.contentType) ? decodeBody(home.body, home.contentType) : '';
  // A meta refresh or script redirect, often to a new domain or a language folder.
  for (let hop = 0; hop < 2 && fetcher.budgetLeft > 0; hop++) {
    const target = clientRedirect(homeHtml, home.url);
    if (!target) break;
    const next = await fetcher.get(target);
    pages.push(visit(next));
    if (next.kind !== 'ok' || next.status >= 400 || !isHtml(next.contentType)) break;
    found.push(...extractEmails(homeHtml, home.url));
    home = next;
    homeHtml = decodeBody(next.body, next.contentType);
  }
  if (pageWall(homeHtml) === 'challenge') return { status: 'refused', ...empty, pages, error: 'bot challenge' };
  found.push(...extractEmails(homeHtml, home.url));
  people.push(...extractPeople(homeHtml, home.url));
  const texts: SitePage[] = homeHtml ? [openerText(homeHtml, home.url)] : [];

  // A homepage that redirects to a new brand domain makes that domain "own site" too, unless it is a platform.
  const landed = hostToDomain(new URL(home.url).hostname);
  const own = landed && landed !== companyDomain && !isPlatformDomain(landed) ? [companyDomain, landed] : [companyDomain];

  // The sitemap only when the homepage links to few likely pages: a menu built by script, or a one page site.
  let sitemapPages: string[] = [];
  if (pickLikelyPages(homeHtml, home.url, 3).length < 2) {
    sitemapPages = await readSitemaps(fetcher, home.url, pages, Math.min(SITEMAP_MAX_FILES, maxPages - fetched() - 1));
  }
  const queue = planPages(homeHtml, home.url, sitemapPages, maxPages - 1);

  const seen = new Set([website, home.url]);
  let outOfBudget = false;
  /** Reads one page; false once no more may be read. */
  const read = async (url: string): Promise<boolean> => {
    if (outOfBudget || fetched() >= maxPages) return false;
    if (seen.has(url)) return true;
    seen.add(url);
    if (fetcher.budgetLeft <= 0) {
      outOfBudget = true;
      pages.push({ url, status: 0, bytes: 0, note: 'budget' });
      return false;
    }
    const page = await fetcher.get(url);
    pages.push(visit(page));
    if (page.kind === 'ok' && page.status < 400 && isHtml(page.contentType)) {
      const html = decodeBody(page.body, page.contentType);
      found.push(...extractEmails(html, page.url));
      readPeople(html, page.url);
      if (texts.length < OPENER_PAGES && !NO_TEXT_PATH.test(new URL(page.url).pathname)) {
        texts.push(openerText(html, page.url));
      }
    }
    return true;
  };
  for (const url of queue) if (!(await read(url))) break;
  // No address on the company's own domain yet: the usual contact paths, while pages are left.
  if (!hasOwnAddress(found, own)) {
    for (const url of fallbackPages(home.url, seen, maxPages)) if (!(await read(url))) break;
  }

  const emails = selectForCompany(found, own);
  const named = mergePeople(people);
  if (emails.length === 0 && looksJsOnly(homeHtml)) return { status: 'js_only', ...empty, emails, pages, people: named, peopleTexts: sharePeopleText(peopleTexts) };
  return { status: 'done', emails, pages, texts: texts.filter((t) => t.text.length > 0), people: named, peopleTexts: sharePeopleText(peopleTexts) };
}

const KIND_ORDER = { team: 0, about: 1, imprint: 2 } as const;

/**
 * The people pages' text within PEOPLE_TEXT_MAX: team pages first, the
 * imprint last, and the budget shared, so one long about page cannot crowd
 * out the team page read after it. A page that needs less leaves the rest
 * to the others.
 */
export function sharePeopleText(pages: SitePage[], max = PEOPLE_TEXT_MAX): SitePage[] {
  const ordered = pages
    .map((p, i) => ({ p, i, kind: KIND_ORDER[peoplePageKind(p.url) ?? 'imprint'] }))
    .sort((a, b) => a.kind - b.kind || a.i - b.i)
    .map(({ p }) => p);
  // Shortest first, so what a short page does not need goes to the longer ones.
  const sizes = new Map<SitePage, number>();
  let left = max;
  const bySize = [...ordered].sort((a, b) => a.text.length - b.text.length);
  for (const [i, p] of bySize.entries()) {
    const size = Math.min(p.text.length, Math.floor(left / (bySize.length - i)));
    sizes.set(p, size);
    left -= size;
  }
  return ordered.map((p) => ({ ...p, text: p.text.slice(0, sizes.get(p) ?? 0) })).filter((p) => p.text.length > 0);
}

/** Pages listed in the site's sitemaps (from robots.txt, else /sitemap.xml), at most `maxFiles` fetches. */
async function readSitemaps(fetcher: SiteFetcher, homeUrl: string, pages: PageVisit[], maxFiles: number): Promise<string[]> {
  if (maxFiles <= 0) return [];
  const origin = new URL(homeUrl).origin;
  const declared = (await fetcher.sitemapsFor(homeUrl)).filter((u) => {
    try {
      const host = hostToDomain(new URL(u).hostname);
      const homeHost = hostToDomain(new URL(homeUrl).hostname);
      return !!host && !!homeHost && host === homeHost;
    } catch {
      return false;
    }
  });
  const queue = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];
  const out: string[] = [];
  for (let i = 0; i < maxFiles && queue.length > 0 && fetcher.budgetLeft > 0; i++) {
    const url = queue.shift()!;
    const res = await fetcher.get(url, SITEMAP_MAX_BYTES);
    pages.push(visit(res));
    if (res.kind !== 'ok' || res.status >= 400) continue;
    const { pages: listed, sitemaps } = parseSitemap(res.body.toString('utf8'), homeUrl);
    out.push(...listed);
    if (listed.length === 0) queue.unshift(...rankSitemaps(sitemaps).slice(0, maxFiles));
  }
  return out;
}

function visit(f: Fetched): PageVisit {
  const note = f.kind === 'robots' ? 'robots' : f.kind === 'error' ? 'error' : isHtml(f.contentType) ? undefined : 'not_html';
  return { url: f.url, status: f.status, bytes: f.body.byteLength, ...(note ? { note } : {}) };
}
