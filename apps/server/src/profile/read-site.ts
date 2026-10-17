// Reads the user's own website for the site profile: the homepage plus the
// pages that say what the business sells (about, pricing, services, product,
// customers). Same fetcher and rules as the email crawl (src/leads/crawl.ts):
// robots.txt on every hop, one request per second per host, a byte budget.
// Returns the visible text of each page, capped, for the Claude prompt.

import { load } from 'cheerio';
import { hostToDomain, looksJsOnly, pageWall, registrableDomain, sameSite } from '@nvoke/shared/crawl';
import { decodeBody } from '../leads/http.js';
import { SiteFetcher, isHtml, type CrawlDeps } from '../leads/crawl.js';

export const SITE_MAX_PAGES = 5;
const SITE_MAX_BYTES = 2_000_000;
/** Visible text kept per page and in all. */
const PAGE_TEXT_MAX = 6_000;
const TOTAL_TEXT_MAX = 20_000;
/** Below this much text in all, there is nothing to profile. */
const MIN_TEXT = 200;
/** No new page is started after this, so a long Crawl-delay cannot hold the request. */
const TIME_BUDGET_MS = 20_000;

/** Path and link text keywords for pages that describe the business, strongest first. */
const PROFILE_HINTS: Array<{ re: RegExp; score: number }> = [
  { re: /pricing|prices|priser|preise|tarif|precios|prezzi|plans\b/i, score: 100 },
  { re: /services|ydelser|tjenester|leistungen|tjanster|servizi|servicios|what-we-do|solutions|losninger/i, score: 90 },
  { re: /about|om-os|omos|om-oss|ueber-uns|uber-uns|über|qui-sommes|chi-siamo|sobre/i, score: 80 },
  { re: /product|produkt|features|funktioner|platform/i, score: 70 },
  { re: /customers|kunder|kunden|clients|cases|case-stud|references|referencer/i, score: 60 },
  { re: /industries|brancher|who-we-serve|for-/i, score: 40 },
];

const SKIP = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|webm|css|js|xml|json|txt)$/i;

export interface SitePage {
  url: string;
  title: string;
  description: string;
  text: string;
}

export type ReadSiteResult =
  | { ok: true; website: string; domain: string; pages: SitePage[] }
  | { ok: false; reason: 'unreachable' | 'blocked' | 'refused' | 'js_only' | 'empty' };

/** Same-site links that look like they describe the business, best first. */
export function pickProfilePages(html: string, pageUrl: string, max: number): string[] {
  const base = new URL(pageUrl);
  const baseHost = hostToDomain(base.hostname);
  if (!baseHost) return [];
  const $ = load(html);
  const scored = new Map<string, number>();
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
    if (!host || !sameSite(host, baseHost) || SKIP.test(url.pathname)) return;
    if (url.pathname === '/' || url.pathname === '') return;
    url.hash = '';
    const haystack = `${decodeURIComponentSafe(url.pathname)} ${$(el).text().slice(0, 80)}`;
    let score = 0;
    for (const hint of PROFILE_HINTS) if (hint.re.test(haystack)) score = Math.max(score, hint.score);
    if (score === 0) return;
    score -= Math.min(60, (url.pathname.split('/').filter(Boolean).length - 1) * 25);
    if (url.search) score -= 5;
    const key = url.toString();
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  });
  // One page per kind of hint is enough: /pricing beats /pricing/enterprise and /pricing/teams.
  const picked: string[] = [];
  const kinds = new Set<number>();
  for (const [url] of [...scored.entries()].sort((a, b) => b[1] - a[1])) {
    const kind = PROFILE_HINTS.findIndex((h) => h.re.test(decodeURIComponentSafe(new URL(url).pathname)));
    if (kind >= 0 && kinds.has(kind)) continue;
    if (kind >= 0) kinds.add(kind);
    picked.push(url);
    if (picked.length >= max) break;
  }
  return picked;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Title, meta description and the visible text of a page, whitespace collapsed and capped. */
export function pageText(html: string, url: string): SitePage {
  const $ = load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 200);
  const description = ($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  $('script, style, noscript, svg, iframe, template, form, nav, footer').remove();
  // Block elements end a line, so headings and list items do not run together.
  $('h1, h2, h3, h4, h5, h6, p, li, div, section, article, br, tr').after('\n');
  const text = $('body')
    .text()
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((l, i, all) => all.indexOf(l) === i)
    .join('\n')
    .slice(0, PAGE_TEXT_MAX);
  return { url, title, description, text };
}

export async function readSite(website: string, deps: CrawlDeps, now: () => number = Date.now): Promise<ReadSiteResult> {
  const started = now();
  const fetcher = new SiteFetcher(deps, SITE_MAX_BYTES);

  let home = await fetcher.get(website);
  if (home.kind === 'error' && website.startsWith('https://')) home = await fetcher.get(`http://${website.slice('https://'.length)}`);
  if (home.kind === 'robots') return { ok: false, reason: 'blocked' };
  if (home.kind === 'ok' && [401, 403, 429, 503].includes(home.status)) return { ok: false, reason: 'refused' };
  if (home.kind === 'error' || home.status >= 400 || !isHtml(home.contentType)) return { ok: false, reason: 'unreachable' };

  const homeHtml = decodeBody(home.body, home.contentType);
  if (pageWall(homeHtml) === 'challenge') return { ok: false, reason: 'refused' };
  const domain = hostToDomain(new URL(home.url).hostname);
  if (!domain) return { ok: false, reason: 'unreachable' };

  const pages: SitePage[] = [pageText(homeHtml, home.url)];
  for (const url of pickProfilePages(homeHtml, home.url, SITE_MAX_PAGES - 1)) {
    if (now() - started > TIME_BUDGET_MS || fetcher.budgetLeft <= 0) break;
    const page = await fetcher.get(url);
    if (page.kind !== 'ok' || page.status >= 400 || !isHtml(page.contentType)) continue;
    pages.push(pageText(decodeBody(page.body, page.contentType), page.url));
  }

  let total = 0;
  for (const p of pages) {
    p.text = p.text.slice(0, Math.max(0, TOTAL_TEXT_MAX - total));
    total += p.text.length;
  }
  if (total < MIN_TEXT) return { ok: false, reason: looksJsOnly(homeHtml) ? 'js_only' : 'empty' };
  return { ok: true, website: home.url, domain: registrableDomain(domain), pages };
}
