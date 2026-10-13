// Crawls one company website for published email addresses.
//
// Limits (docs/SPEC.md): the homepage plus likely pages (contact, about,
// team, impressum, privacy, legal), at most 8 pages and 2 MB per company,
// robots.txt honored on every hop, at most one request per second per host
// (longer if robots.txt asks for a Crawl-delay).

import { load } from 'cheerio';
import { hostToDomain, sameSite } from './domain.js';
import { extractEmails, selectForCompany, type ExtractedEmail } from './extract.js';
import { decodeBody, fetchCapped, type FetchLike } from './http.js';
import type { RateLimiter } from './limits.js';
import type { RobotsCache } from './robots.js';

export const CRAWL_MAX_PAGES = 8;
export const CRAWL_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 15_000;

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
  status: 'done' | 'failed' | 'blocked';
  emails: ExtractedEmail[];
  pages: PageVisit[];
  error?: string;
}

/** Path and link text keywords, strongest first. English, Danish, German, a little Nordic and Romance. */
const PAGE_HINTS: Array<{ re: RegExp; score: number }> = [
  { re: /kontakt|contact|kontakta|contatt|contacto|yhteystiedot/i, score: 100 },
  { re: /impressum|imprint/i, score: 90 },
  { re: /\bteam\b|medarbejder|employees|our-people|\bpeople\b|staff|personale|ansatte|mitarbeiter/i, score: 80 },
  { re: /about|om-os|omos|om-oss|ueber-uns|uber-uns|über|qui-sommes|chi-siamo|sobre/i, score: 70 },
  { re: /privacy|privatliv|persondata|datenschutz|gdpr|personvern|integritet/i, score: 50 },
  { re: /legal|juridisk|vilkaar|terms|agb|cvr/i, score: 40 },
];

const GUESSED_PATHS = ['/contact', '/kontakt', '/about', '/impressum'];

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|mov|webm|css|js|xml|json|txt)$/i;

function isHtml(contentType: string | null): boolean {
  if (!contentType) return true;
  return /text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType);
}

/** Same-site links that look like they lead to contact details, best first. */
export function pickLikelyPages(html: string, pageUrl: string, max: number): string[] {
  const base = new URL(pageUrl);
  const scored = new Map<string, number>();
  let $;
  try {
    $ = load(html);
  } catch {
    return [];
  }
  $('a[href]').each((_i, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const host = hostToDomain(url.hostname);
    const baseHost = hostToDomain(base.hostname);
    if (!host || !baseHost || !sameSite(host, baseHost)) return;
    if (SKIP_EXTENSIONS.test(url.pathname)) return;
    url.hash = '';
    const key = url.toString();
    if (key === base.toString() || url.pathname === '/' || url.pathname === '') return;
    const haystack = `${safeDecode(url.pathname)} ${$(el).text().slice(0, 80)}`;
    let score = 0;
    for (const hint of PAGE_HINTS) if (hint.re.test(haystack)) score = Math.max(score, hint.score);
    if (score === 0) return;
    // Shallow pages first: /kontakt beats /blog/2019/how-to-contact-us.
    score -= Math.min(60, (url.pathname.split('/').filter(Boolean).length - 1) * 25);
    if (url.search) score -= 5;
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  });
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([url]) => url);
}

interface Fetched {
  kind: 'ok' | 'robots' | 'error';
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  error?: string;
}

class SiteFetcher {
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
  if (home.kind === 'robots') return { status: 'blocked', emails: [], pages };
  if (home.kind === 'error' || home.status >= 400) {
    return { status: 'failed', emails: [], pages, error: home.error ?? `homepage answered ${home.status}` };
  }

  const homeHtml = isHtml(home.contentType) ? decodeBody(home.body, home.contentType) : '';
  found.push(...extractEmails(homeHtml, home.url));

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
    found.push(...extractEmails(decodeBody(page.body, page.contentType), page.url));
  }

  // A homepage that redirects to a new brand domain makes that domain "own site" too.
  const landed = hostToDomain(new URL(home.url).hostname);
  const own = landed && landed !== companyDomain ? [companyDomain, landed] : [companyDomain];
  return { status: 'done', emails: selectForCompany(found, own), pages };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function visit(f: Fetched): PageVisit {
  const note = f.kind === 'robots' ? 'robots' : f.kind === 'error' ? 'error' : isHtml(f.contentType) ? undefined : 'not_html';
  return { url: f.url, status: f.status, bytes: f.body.byteLength, ...(note ? { note } : {}) };
}
