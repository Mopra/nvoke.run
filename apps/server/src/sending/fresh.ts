// One fresh detail for the write job (docs/sending/plan.md, "Writing"): the
// company's newest post. From the homepage's links pick one blog, news,
// changelog or case study page, read it with the crawl's rules (robots.txt
// on every hop, the per host rate, a byte cap, a short time budget) through
// the guarded fetcher, and hand its visible text to the prompt as one more
// untrusted page. Anything that fails gives null: a missing post never
// fails the write.

import { load } from 'cheerio';
import { hostToDomain, pageWall, sameSite } from '@nvoke/shared/crawl';
import { SiteFetcher, isHtml, type CrawlDeps } from '../leads/crawl.js';
import { decodeBody } from '../leads/http.js';
import { pageText, type SitePage } from '../leads/page-text.js';

/** Bytes read per company, homepage included. */
export const FRESH_MAX_BYTES = 2_000_000;
/** Time per company before the post is given up. */
export const FRESH_TIMEOUT_MS = 12_000;
/** Visible text of the post kept for the prompt. */
export const FRESH_TEXT_MAX = 2_500;

/** Path segments of a section of posts: blog, news, changelog, case studies, in a few languages. */
const SECTION = /^(blog|blogs|news|nyheder|neuigkeiten|nieuws|nyheter|noticias|actualites|actualités|changelog|release-notes|releases|updates|whats-new|what-s-new|insights|articles|artikler|journal|stories|case-studies|case-study|cases|customer-stories|success-stories|kundecases|referencer|press|presse|posts|magazine)$/i;
/** Sub pages of a section that are lists, not posts. */
const LISTING = /^(tag|tags|category|categories|kategori|author|authors|page|archive|feed|rss|search)$/i;
const SKIP = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|webm|css|js|xml|json|txt)$/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Same-site links to posts (`/blog/our-new-api`) and to post sections (`/blog`), in the page's order. */
export function pickPostLinks(html: string, pageUrl: string): { posts: string[]; sections: string[] } {
  const posts: string[] = [];
  const sections: string[] = [];
  let base: URL;
  let $;
  try {
    base = new URL(pageUrl);
    $ = load(html);
  } catch {
    return { posts, sections };
  }
  const baseHost = hostToDomain(base.hostname);
  if (!baseHost) return { posts, sections };
  const seen = new Set<string>();
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
    url.hash = '';
    const key = url.toString();
    if (seen.has(key)) return;
    seen.add(key);
    const parts = safeDecode(url.pathname).split('/').filter(Boolean);
    // blog.acme.com/our-new-api is a post too.
    const onBlogHost = /^(blog|news|changelog)\./i.test(url.hostname);
    const at = onBlogHost ? -1 : parts.findIndex((p) => SECTION.test(p));
    if (at < 0 && !onBlogHost) return;
    const rest = parts.slice(at + 1).filter((p) => !/^\d{1,4}$/.test(p));
    if (rest.some((p) => LISTING.test(p)) || url.searchParams.has('page')) return;
    if (rest.length === 0) sections.push(key);
    else if (rest[rest.length - 1]!.length >= 4) posts.push(key);
  });
  return { posts, sections };
}

/** Whether a kept page already is a post, so there is no need to fetch one. */
export function isPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return pickPostLinks(`<a href="${u.toString().replace(/"/g, '%22')}">x</a>`, `${u.protocol}//${u.host}/`).posts.length > 0;
  } catch {
    return false;
  }
}

/**
 * The company's newest post as a page, or null. The first post the
 * homepage links to, else the first post on the first section it links to,
 * else that section page itself (it lists the newest titles).
 */
export async function latestPost(website: string, deps: CrawlDeps, signal?: AbortSignal): Promise<SitePage | null> {
  const timeout = AbortSignal.timeout(FRESH_TIMEOUT_MS);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const fetcher = new SiteFetcher(deps, FRESH_MAX_BYTES, both);
    const read = async (url: string): Promise<{ html: string; url: string } | null> => {
      const page = await fetcher.get(url);
      if (page.kind !== 'ok' || page.status < 200 || page.status >= 300 || !isHtml(page.contentType)) return null;
      const html = decodeBody(page.body, page.contentType);
      return pageWall(html) ? null : { html, url: page.url };
    };
    const home = await read(website);
    if (!home) return null;
    const links = pickPostLinks(home.html, home.url);
    let post = links.posts[0] ? await read(links.posts[0]) : null;
    if (!post && links.sections[0]) {
      const section = await read(links.sections[0]);
      if (section) {
        const first = pickPostLinks(section.html, section.url).posts.find((u) => u !== section.url);
        post = (first ? await read(first) : null) ?? section;
      }
    }
    if (!post) return null;
    const page = pageText(post.html, post.url, FRESH_TEXT_MAX);
    return page.text.length >= 200 ? page : null;
  } catch {
    return null;
  }
}
