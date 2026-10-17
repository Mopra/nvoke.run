// The pictures on a site profile: the site's icon, and its share image
// (og:image) or, when it has none, a screenshot of the homepage. They show
// the user that nvoke really read their site. Both come from the homepage
// HTML that readSite already fetched; each candidate is checked to load as
// an image before it is kept, since the browser hotlinks it.

import { load } from 'cheerio';
import { BOT_USER_AGENT, type FetchLike } from '../leads/http.js';

/** An image we hotlink must answer within this. */
const CHECK_TIMEOUT_MS = 5_000;
/** Above this we do not hotlink it: a 10 MB share image slows the screen. */
const IMAGE_MAX_BYTES = 3_000_000;

export interface VisualCandidates {
  /** Best first: apple-touch-icon, the largest declared icon, then /favicon.ico. */
  icons: string[];
  /** og:image and twitter:image, in that order. */
  images: string[];
}

/** Icon and share image URLs the homepage declares, absolute and https only. */
export function visualCandidates(html: string, pageUrl: string): VisualCandidates {
  const $ = load(html);
  const resolve = (href: string | undefined): string | null => {
    if (!href?.trim()) return null;
    try {
      const url = new URL(href.trim(), pageUrl);
      // The app is served over https; an http image would be blocked as mixed content.
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  };

  const icons: Array<{ url: string; score: number }> = [];
  $('link[rel][href]').each((_i, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/);
    const url = resolve($(el).attr('href'));
    if (!url) return;
    const size = Math.max(0, ...($(el).attr('sizes') ?? '').split(/\s+/).map((s) => Number.parseInt(s, 10) || 0));
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) icons.push({ url, score: 1_000 + (size || 180) });
    else if (rel.includes('icon')) {
      const svg = /\.svg(\?|$)/i.test(url) || $(el).attr('type') === 'image/svg+xml';
      icons.push({ url, score: svg ? 900 : size || 16 });
    }
  });
  icons.sort((a, b) => b.score - a.score);
  const favicon = resolve('/favicon.ico');

  const images: string[] = [];
  for (const selector of ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]']) {
    const url = resolve($(selector).first().attr('content'));
    if (url && !images.includes(url)) images.push(url);
  }

  const iconUrls = [...new Set([...icons.map((i) => i.url), ...(favicon ? [favicon] : [])])];
  return { icons: iconUrls.slice(0, 4), images: images.slice(0, 2) };
}

/** The first candidate that answers 200 with an image of a sane size, or null. */
export async function firstImage(fetch: FetchLike, urls: string[], signal?: AbortSignal): Promise<string | null> {
  for (const url of urls) {
    if (signal?.aborted) return null;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'image/*', 'user-agent': BOT_USER_AGENT },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]) : AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      await res.body?.cancel().catch(() => undefined);
      const type = res.headers.get('content-type') ?? '';
      const length = Number(res.headers.get('content-length') ?? 0);
      // Some servers send icons as octet-stream; the extension then has to say image.
      const looksImage = type.startsWith('image/') || (/octet-stream/.test(type) && /\.(ico|png|jpe?g|webp|gif|svg)(\?|$)/i.test(url));
      const final = res.url || url;
      if (res.status === 200 && looksImage && length <= IMAGE_MAX_BYTES && final.startsWith('https:')) return final;
    } catch {
      // Unreachable or refused: try the next one.
    }
  }
  return null;
}
