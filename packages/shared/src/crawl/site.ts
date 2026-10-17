// How to reach a company site at all: the address variants worth trying
// when the one a source gave fails, client side redirects, and the pages a
// sitemap lists. Shared by the server crawl and the desktop's local crawl.

import { load } from 'cheerio';
import { hostToDomain, isPlatformDomain, sameSite } from './domain.ts';

/**
 * The homepage addresses to try, in order: the one given, then plain http,
 * then with "www." added or removed. Small business sites often answer on
 * only one of them (no TLS, or DNS only for www).
 */
export function homepageVariants(website: string): string[] {
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return [website];
  }
  const out = [url.toString()];
  const add = (protocol: string, host: string) => {
    const v = new URL(url.toString());
    v.protocol = protocol;
    v.hostname = host;
    if (!out.includes(v.toString())) out.push(v.toString());
  };
  const host = url.hostname;
  const other = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  add('http:', host);
  if (hostToDomain(other)) {
    add('https:', other);
    add('http:', other);
  }
  return out;
}

/** Below this much visible text, a page with a script redirect is only a redirect. */
const REDIRECT_PAGE_TEXT = 400;

/**
 * Where a page sends the browser without an HTTP redirect: a meta refresh,
 * or a script that sets `location` on a page with next to no content. Null
 * when it does neither, or the target is not http(s) or is a platform
 * (a booking site, a domain parking lander's host), never the company's own.
 * A refresh inside <noscript> and a `location` in an onclick are not redirects.
 */
export function clientRedirect(html: string, pageUrl: string): string | null {
  let $;
  try {
    $ = load(html.slice(0, 100_000));
  } catch {
    return null;
  }
  $('noscript').remove();
  let target: string | undefined;
  const content = $('meta[http-equiv="refresh" i]').first().attr('content') ?? '';
  target = /url\s*=\s*['"]?([^'"\s;]+)/i.exec(content)?.[1];
  if (!target) {
    const code = $('script:not([src])')
      .map((_i, el) => $(el).text())
      .get()
      .join('\n');
    const script = /(?:window\.|document\.|top\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']|location\.(?:replace|assign)\(\s*["']([^"']+)["']\s*\)/i.exec(code);
    if (script) {
      $('script, style').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      if (text.length < REDIRECT_PAGE_TEXT) target = script[1] ?? script[2];
    }
  }
  if (!target) return null;
  try {
    const url = new URL(target, pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = hostToDomain(url.hostname);
    if (!host || isPlatformDomain(host)) return null;
    url.hash = '';
    return url.toString() === new URL(pageUrl).toString() ? null : url.toString();
  } catch {
    return null;
  }
}

/** Sitemaps fetched per site, index included. */
export const SITEMAP_MAX_FILES = 2;
export const SITEMAP_MAX_BYTES = 1_000_000;

/**
 * The <loc> entries of a sitemap or sitemap index, split into pages and
 * further sitemaps, limited to the site itself.
 */
export function parseSitemap(xml: string, siteUrl: string): { pages: string[]; sitemaps: string[] } {
  const siteHost = hostToDomain(new URL(siteUrl).hostname);
  const pages: string[] = [];
  const sitemaps: string[] = [];
  if (!siteHost) return { pages, sitemaps };
  const isIndex = /<sitemapindex[\s>]/i.test(xml.slice(0, 2_000));
  for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
    const raw = (m[1] ?? '').replace(/&amp;/g, '&');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const host = hostToDomain(url.hostname);
    if (!host || !sameSite(host, siteHost)) continue;
    // Compressed sitemaps cannot be read without inflating them; skip rather than fetch.
    if (/\.gz$/i.test(url.pathname)) continue;
    if (isIndex || /\.xml(\.gz)?$/i.test(url.pathname)) sitemaps.push(url.toString());
    else pages.push(url.toString());
    if (pages.length + sitemaps.length >= 50_000) break;
  }
  return { pages, sitemaps };
}

/** Of a sitemap index's children, the ones most likely to list plain pages ("page-sitemap.xml"), first. */
export function rankSitemaps(urls: string[]): string[] {
  const score = (u: string) => (/page|pages|side|seiten/i.test(u) ? 2 : /post|product|produkt|blog|news|category|tag|author|image|video/i.test(u) ? 0 : 1);
  return [...urls].sort((a, b) => score(b) - score(a));
}
