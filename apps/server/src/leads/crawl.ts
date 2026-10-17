// Crawls one company website for published email addresses.
//
// Limits (docs/SPEC.md): the homepage plus likely pages (contact, about,
// team, impressum, privacy, legal), at most 8 pages and 2 MB per company,
// robots.txt honored on every hop, at most one request per second per host
// (longer if robots.txt asks for a Crawl-delay).

import {
  CRAWL_MAX_BYTES,
  CRAWL_MAX_PAGES,
  GUESSED_PATHS,
  extractEmails,
  hostToDomain,
  looksJsOnly,
  pageWall,
  pickLikelyPages,
  selectForCompany,
  type ExtractedEmail,
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
const ADDRESS_IN_TEXT = /[\w.+-]+(@|\s*[[(]\s*(at|snabel-?a)\s*[\])]\s*)[\w-]+((\.|\s*[[(]\s*(dot|punktum)\s*[\])]\s*)[\w-]+)+/gi;

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

/** Pages that say little about the business, or mostly name people. Their text is not kept. */
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
  error?: string;
}

export function isHtml(contentType: string | null): boolean {
  if (!contentType) return true;
  return /text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType);
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

  /** GET with manual redirects, so robots.txt and the rate limit apply to every hop. */
  async get(startUrl: string): Promise<Fetched> {
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
          maxBytes: Math.max(0, this.budgetLeft),
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

  // Homepage. Small business sites still go without TLS, so fall back to http.
  let home = await fetcher.get(website);
  pages.push(visit(home));
  if (home.kind === 'error' && website.startsWith('https://')) {
    home = await fetcher.get(`http://${website.slice('https://'.length)}`);
    pages.push(visit(home));
  }
  if (home.kind === 'robots') return { status: 'blocked', emails: [], pages, texts: [] };
  if (home.kind === 'ok' && REFUSED_STATUSES.has(home.status)) {
    return { status: 'refused', emails: [], pages, texts: [], error: `homepage answered ${home.status}` };
  }
  if (home.kind === 'error' || home.status >= 400) {
    return { status: 'failed', emails: [], pages, texts: [], error: home.error ?? `homepage answered ${home.status}` };
  }

  const homeHtml = isHtml(home.contentType) ? decodeBody(home.body, home.contentType) : '';
  if (pageWall(homeHtml) === 'challenge') return { status: 'refused', emails: [], pages, texts: [], error: 'bot challenge' };
  found.push(...extractEmails(homeHtml, home.url));
  const texts: SitePage[] = homeHtml ? [openerText(homeHtml, home.url)] : [];

  let queue = pickLikelyPages(homeHtml, home.url, maxPages - 1);
  if (queue.length === 0) {
    const origin = new URL(home.url).origin;
    queue = GUESSED_PATHS.slice(0, Math.min(3, maxPages - 1)).map((p) => `${origin}${p}`);
  }

  const seen = new Set([website, home.url]);
  for (const url of queue) {
    if (pages.filter((p) => p.note !== 'robots').length >= maxPages) break;
    if (seen.has(url)) continue;
    seen.add(url);
    if (fetcher.budgetLeft <= 0) {
      pages.push({ url, status: 0, bytes: 0, note: 'budget' });
      break;
    }
    const page = await fetcher.get(url);
    pages.push(visit(page));
    if (page.kind !== 'ok' || page.status >= 400 || !isHtml(page.contentType)) continue;
    const html = decodeBody(page.body, page.contentType);
    found.push(...extractEmails(html, page.url));
    if (texts.length < OPENER_PAGES && !NO_TEXT_PATH.test(new URL(page.url).pathname)) {
      texts.push(openerText(html, page.url));
    }
  }

  // A homepage that redirects to a new brand domain makes that domain "own site" too.
  const landed = hostToDomain(new URL(home.url).hostname);
  const own = landed && landed !== companyDomain ? [companyDomain, landed] : [companyDomain];
  const emails = selectForCompany(found, own);
  if (emails.length === 0 && looksJsOnly(homeHtml)) return { status: 'js_only', emails, pages, texts: [] };
  return { status: 'done', emails, pages, texts: texts.filter((t) => t.text.length > 0) };
}

function visit(f: Fetched): PageVisit {
  const note = f.kind === 'robots' ? 'robots' : f.kind === 'error' ? 'error' : isHtml(f.contentType) ? undefined : 'not_html';
  return { url: f.url, status: f.status, bytes: f.body.byteLength, ...(note ? { note } : {}) };
}
