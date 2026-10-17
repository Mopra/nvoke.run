// List pages and agency directories (docs/SPEC.md, "Describe your customer").
// A search result titled "Top 25 lead generation agencies in London", or a
// page on clutch.co, designrush or sortlist, names many companies at once.
// The page is fetched once with the crawler's rules (robots.txt on every hop,
// one request per second per host, a byte cap; no CAPTCHA solving, no
// logins) and the companies it links to become candidates. One free page
// replaces many paid search requests.

import { load } from 'cheerio';
import { isPlatformDomain, isWebmailDomain, normalizeDomain, pageWall, registrableDomain } from './domain.js';
import { SiteFetcher, isHtml, type CrawlDeps } from './crawl.js';
import { decodeBody, type FetchLike } from './http.js';
import type { RateLimiter } from './limits.js';
import { RobotsCache } from './robots.js';
import { guardedFetch } from '../profile/guarded-fetch.js';

/** Directories whose pages list agencies and vendors. Never a candidate themselves. */
export const DIRECTORY_SITES = [
  'clutch.co', 'designrush.com', 'goodfirms.co', 'sortlist.com', 'sortlist.co.uk', 'sortlist.fr', 'sortlist.de',
  'sortlist.es', 'sortlist.it', 'sortlist.nl', 'sortlist.be', 'agencyspotter.com', 'themanifest.com', 'upcity.com',
  'expertise.com', 'agencyvista.com', 'topdevelopers.co', 'selectedfirms.co', 'techreviewer.co', 'superbcompanies.com',
  'mobileappdaily.com', 'agencylist.org', 'bark.com', 'leadgenerationagencies.com',
];
const DIRECTORY_SET = new Set(DIRECTORY_SITES);

export function isDirectoryDomain(domain: string): boolean {
  return DIRECTORY_SET.has(registrableDomain(domain.toLowerCase()));
}

/**
 * "Top 25 ...", "The 10 best ...", "15 lead generation agencies in London",
 * "List of ...", "B2B SaaS startups in Berlin", "12 Belkins alternatives".
 */
const LIST_TITLE =
  /\b(top|best)\s+\d{1,3}\b|\b\d{1,3}\+?\s+(best|top|leading|great|biggest)\b|^\s*\d{1,3}\+?\s+\p{L}[\p{L}\s-]{2,60}\b(agencies|companies|firms|consultants|consultancies|providers|services|studios|startups|tools|vendors)\b|\blist of\b|\b(top|best|leading)\s+[\p{L}\s-]{2,60}\b(agencies|companies|firms|consultancies|providers)\s+(in|for|near)\b|^\s*[\p{L}\p{N}\s&-]{2,60}\b(agencies|companies|firms|consultancies|startups)\s+(in|based in)\s+\p{Lu}|\b\d{1,3}\+?\s+(best\s+)?[\p{L}.\s-]{2,40}\b(alternatives|competitors)\b|\b(alternatives|competitors)\s+(to|of)\s+\p{Lu}/iu;

/**
 * Pages on a company's own site that name related companies: a tool's
 * partner or agency directory ("/partners", "/agencies", "/experts") and
 * alternatives or competitor pages. Read like any list.
 */
const LIST_PATH = /\/(partners?|partner-directory|find-a-partner|certified-partners|agencies|agency-partners|experts|alternatives?|competitors)(\/[^/]*)?\/?$/i;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** Whether a search result is a page that lists many companies, by its address and title. */
export function isListPage(url: string, title: string | undefined): boolean {
  const domain = normalizeDomain(url);
  if (!domain) return false;
  if (isDirectoryDomain(domain)) {
    // A directory's own profile of one company is not a list; its category pages are.
    try {
      const path = new URL(url).pathname;
      return path.length > 1 && !/\/(profile|company|agency|agencies\/[^/]+\/reviews)\/[^/]+\/?$/i.test(path);
    } catch {
      return false;
    }
  }
  return LIST_TITLE.test((title ?? '').replace(/<[^>]+>/g, '')) || LIST_PATH.test(pathOf(url));
}

export interface ListCandidate {
  name: string;
  website: string;
  /** Text next to the link on the list page, for fit scoring. */
  context: string;
}

/** Link texts that say nothing about the company. */
const GENERIC_TEXT = /^(visit( (website|site))?|website|web site|site|homepage|learn more|read more|more|view( profile)?|profile|here|click here|link|go|official site|see more|details|\d+|https?:\/\/.*|www\..*)$/i;
/** Query parameters directories use to wrap the real address in a redirect. */
const REDIRECT_PARAMS = ['u', 'url', 'redirect', 'redirect_url', 'redirect_uri', 'target', 'to', 'dest', 'destination', 'link', 'out', 'r'];
/** Sites that only share, track, shorten or pay affiliates, matched on the registrable domain. */
const SKIP_SITES = new Set([
  'addtoany.com', 'sharethis.com', 'doubleclick.net', 'googletagmanager.com', 'gravatar.com', 'w3.org', 'schema.org',
  'cloudflare.com', 'gstatic.com', 'googleapis.com', 'wp.com', 'wordpress.org', 'hubspot.com', 'hs-sites.com',
  'calendly.com', 'typeform.com',
  // Shorteners and link pages
  'bit.ly', 'ow.ly', 'buff.ly', 'tinyurl.com', 'geni.us', 'amzn.to', 'lnkd.in', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
  'is.gd', 't.ly', 'linktr.ee',
  // Affiliate networks and trackers
  'shareasale.com', 'awin1.com', 'prf.hn', 'pxf.io', 'sjv.io', 'impact.com', 'partnerstack.com', 'go2cloud.org',
  'clickbank.net', 'anrdoezrs.net', 'dpbolvw.net', 'jdoqocy.com', 'kqzyfj.com', 'tkqlhce.com', 'linksynergy.com',
  'avantlink.com', 'refersion.com', 'rstyle.me', 'skimresources.com', 'viglink.com', 'tradedoubler.com', 'webgains.com',
  'adtraction.com', 'cj.com', 'ojrq.net', 'getmeasured.com',
]);

export function isSkippedHost(domain: string): boolean {
  const host = domain.toLowerCase();
  return SKIP_SITES.has(host) || SKIP_SITES.has(registrableDomain(host));
}

/** The real address of a link, unwrapping a directory's redirect. */
export function unwrapLink(href: string, pageUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  for (const key of REDIRECT_PARAMS) {
    const inner = url.searchParams.get(key);
    if (inner && /^https?:\/\//i.test(inner)) {
      try {
        return new URL(inner);
      } catch {
        // not an address after all
      }
    }
  }
  return url;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * A link or heading text that reads as a company name, without its list
 * number ("3. Punch!" gives "Punch!"), or null: generic words, sentences and
 * lower case phrases ("call recordings") are not names.
 */
export function nameText(raw: string): string | null {
  const text = cleanText(raw)
    .replace(/^(#\s*)?\d{1,3}\s*[.):]\s*/, '')
    .replace(/^(visit|go to|check out)\s+/i, '')
    .replace(/\s*[→›»>]+$/, '')
    .trim();
  if (text.length < 2 || text.length > 60 || GENERIC_TEXT.test(text)) return null;
  if (text.split(' ').length > 6 || !/^[\p{Lu}\p{N}]/u.test(text)) return null;
  return text;
}

function labelName(domain: string): string {
  const label = registrableDomain(domain).split('.')[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The companies a list page links to: links off the page's own site, not to
 * platforms, directories, webmail or share buttons, one per domain, in page
 * order. Navigation, header and footer are skipped.
 */
export function extractListCandidates(html: string, pageUrl: string, max = 200): ListCandidate[] {
  const pageDomain = normalizeDomain(pageUrl);
  const pageSite = pageDomain ? registrableDomain(pageDomain) : '';
  const $ = load(html);
  $('script, style, noscript, svg, template, nav, header, footer, aside, form, [role="navigation"], [class*="cookie"], [id*="cookie"]').remove();
  const root = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  const out: ListCandidate[] = [];
  const seen = new Set<string>();
  root.find('a[href]').each((_i, el) => {
    if (out.length >= max) return false;
    const a = $(el);
    const url = unwrapLink(a.attr('href') ?? '', pageUrl);
    if (!url) return;
    const domain = normalizeDomain(url.toString());
    if (!domain || isSkippedHost(domain)) return;
    const site = registrableDomain(domain);
    if (site === pageSite || seen.has(site)) return;
    if (isPlatformDomain(domain) || isDirectoryDomain(domain) || isWebmailDomain(domain)) return;
    // Links deep into another site are usually citations, not the company itself.
    if (url.pathname.split('/').filter(Boolean).length > 2) return;
    seen.add(site);
    const text = nameText(a.text());
    const heading = nameText(a.closest('li, tr, article, section, div').find('h2, h3, h4, strong, b').first().text());
    const name = text ?? heading ?? labelName(domain);
    const block = cleanText(a.closest('li, tr, article, p, div').text()).slice(0, 240);
    out.push({ name, website: url.origin, context: block });
  });
  return out;
}

/** Page numbers in an address: `?page=2`, `?p=2`, `?paged=2` or `/page/2/`. */
const PAGE_PARAMS = ['page', 'p', 'pg', 'paged'];
function pageNumber(url: URL): number | null {
  for (const key of PAGE_PARAMS) {
    const v = url.searchParams.get(key);
    if (v && /^\d{1,3}$/.test(v)) return Number(v);
  }
  const m = /\/page\/(\d{1,3})\/?$/.exec(url.pathname);
  return m ? Number(m[1]) : null;
}

/** Link texts of a "next page" link. */
const NEXT_TEXT = /^(next|next page|weiter|nächste|suivant|volgende|næste|nästa|neste|siguiente|successivo|›|»|→|>)$/i;

/** An address without its page number, to tell a next page from another list. */
function withoutPage(u: URL): string {
  const params = new URLSearchParams(u.search);
  for (const key of PAGE_PARAMS) params.delete(key);
  params.sort();
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/page\/\d{1,3}\/?$/, '').replace(/\/$/, '')}?${params.toString()}`;
}

/**
 * The next page of a paginated list, when it is a plain link on the same
 * site whose address only counts the page up (`?page=2`, `/page/2/`). Null
 * otherwise: pages loaded by script, other filters, or another site.
 */
export function nextPageLink(html: string, pageUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  const current = pageNumber(base) ?? 1;
  const $ = load(html);
  const hrefs: string[] = [];
  for (const sel of ['link[rel="next"]', 'a[rel="next"]']) {
    const href = $(sel).first().attr('href');
    if (href) hrefs.push(href);
  }
  $('a[href]').each((_i, el) => {
    const a = $(el);
    const text = cleanText(a.text());
    if (NEXT_TEXT.test(text) || text === String(current + 1) || /\bnext\b/i.test(a.attr('aria-label') ?? '')) hrefs.push(a.attr('href')!);
  });
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    // Only the page number may change.
    if (pageNumber(url) !== current + 1 || withoutPage(url) !== withoutPage(base)) continue;
    url.hash = '';
    return url.toString();
  }
  return null;
}

/** A list page read, with the bytes it took (redirect hops included), for the run's byte budget. */
export type MineResult = (
  | { status: 'ok'; title: string; candidates: ListCandidate[]; next?: string }
  | { status: 'skipped'; reason: 'robots' | 'error' | 'not_html' | 'wall' | 'status' }
) & { bytes: number };

/** Bytes read of one list page: most lists fit in this much HTML, and reading stops at the cap. */
export const LIST_PAGE_MAX_BYTES = 500_000;

/**
 * The crawl deps for list pages: the crawler's rate limit, and a fetch that
 * connects only to public addresses over http(s), checked on every hop and
 * for robots.txt too. A list page links anywhere and its redirects are not
 * ours to trust, so a hop to a private, loopback, link-local or metadata
 * address is refused.
 */
export function listPageDeps(limiter: RateLimiter, fetch: FetchLike = guardedFetch({ allowPrivate: false })): CrawlDeps {
  return { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
}

/** Bytes read of a homepage for its title and meta description, which sit in the head. */
export const HEAD_MAX_BYTES = 250_000;

/**
 * A homepage's title and meta description, read with the crawler's rules
 * (robots.txt, the per host rate, a byte cap), for fit scoring. Null when the
 * site refuses us, is down, walls us off or is not HTML. Pass deps from
 * listPageDeps.
 */
export async function readHead(url: string, deps: CrawlDeps, signal?: AbortSignal): Promise<{ title: string; description: string } | null> {
  const fetcher = new SiteFetcher(deps, HEAD_MAX_BYTES, signal);
  const page = await fetcher.get(url);
  if (page.kind !== 'ok' || page.status < 200 || page.status >= 300 || !isHtml(page.contentType)) return null;
  const html = decodeBody(page.body, page.contentType);
  if (pageWall(html)) return null;
  const $ = load(html);
  const meta = (sel: string) => cleanText($(sel).first().attr('content') ?? '');
  return {
    title: cleanText($('title').first().text()).slice(0, 200),
    description: (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 400),
  };
}

/** Fetches a list page with the crawler's rules and returns the companies it links to. Pass deps from listPageDeps. */
export async function mineListPage(url: string, deps: CrawlDeps, signal?: AbortSignal): Promise<MineResult> {
  const fetcher = new SiteFetcher(deps, LIST_PAGE_MAX_BYTES, signal);
  const page = await fetcher.get(url);
  const bytes = fetcher.bytesUsed;
  const skipped = (reason: 'robots' | 'error' | 'not_html' | 'wall' | 'status'): MineResult => ({ status: 'skipped', reason, bytes });
  if (page.kind === 'robots') return skipped('robots');
  if (page.kind === 'error') return skipped('error');
  if (page.status < 200 || page.status >= 300) return skipped('status');
  if (!isHtml(page.contentType)) return skipped('not_html');
  const html = decodeBody(page.body, page.contentType);
  if (pageWall(html)) return skipped('wall');
  const title = cleanText(load(html)('title').first().text()).slice(0, 200);
  const next = nextPageLink(html, page.url);
  return { status: 'ok', title, candidates: extractListCandidates(html, page.url), ...(next ? { next } : {}), bytes };
}
