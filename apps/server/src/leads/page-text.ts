// The visible text of a page: what the site profile (src/profile) and the
// openers (src/openers) give Claude to read.

import { load } from 'cheerio';

/** Visible text kept per page by default. */
export const PAGE_TEXT_MAX = 6_000;

export interface SitePage {
  url: string;
  title: string;
  description: string;
  text: string;
}

/** Title, meta description and the visible text of a page, whitespace collapsed and capped. */
export function pageText(html: string, url: string, max = PAGE_TEXT_MAX): SitePage {
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
    .slice(0, max);
  return { url, title, description, text };
}
