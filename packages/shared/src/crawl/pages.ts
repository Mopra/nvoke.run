// Which pages of a company site to read, and what a page tells us about the
// site itself. Shared by the server crawl (apps/server/src/leads/crawl.ts)
// and the desktop's local render crawl, so both pick and judge pages alike.

import { load, type CheerioAPI } from 'cheerio';
import { hostToDomain, sameSite } from './domain.ts';

/** How the crawler identifies itself, on every request. */
export const BOT_USER_AGENT = 'nvokebot/1.0 (+https://nvoke.run/bot)';

/** The token robots.txt groups are matched against. */
export const BOT_TOKEN = 'nvokebot';

export const CRAWL_MAX_PAGES = 8;
export const CRAWL_MAX_BYTES = 2_000_000;

/** Path and link text keywords, strongest first. English, Danish, German, a little Nordic and Romance. */
const PAGE_HINTS: Array<{ re: RegExp; score: number }> = [
  { re: /kontakt|contact|kontakta|contatt|contacto|yhteystiedot/i, score: 100 },
  { re: /impressum|imprint/i, score: 90 },
  { re: /\bteam\b|medarbejder|employees|our-people|\bpeople\b|staff|personale|ansatte|mitarbeiter/i, score: 80 },
  { re: /about|om-os|omos|om-oss|ueber-uns|uber-uns|über|qui-sommes|chi-siamo|sobre/i, score: 70 },
  { re: /privacy|privatliv|persondata|datenschutz|gdpr|personvern|integritet/i, score: 50 },
  { re: /legal|juridisk|vilkaar|terms|agb|cvr/i, score: 40 },
];

/** Tried when the homepage links to no likely page. */
export const GUESSED_PATHS = ['/contact', '/kontakt', '/about', '/impressum'];

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|mov|webm|css|js|xml|json|txt)$/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

/** Below this much visible text, a page with scripts is an app shell. */
const APP_SHELL_TEXT = 200;

/**
 * True when the HTML is a shell that only JavaScript fills in: scripts and
 * under 200 characters of visible text, or a noscript that asks for
 * JavaScript. The server crawl cannot read such a site; a browser can.
 */
export function looksJsOnly(html: string): boolean {
  let $;
  try {
    $ = load(html);
  } catch {
    return false;
  }
  const scripts = $('script').length;
  const noscript = $('noscript').text();
  if (/enable javascript|javascript (is )?(required|disabled)|needs? javascript|aktiv[eé]r javascript|javascript aktivieren/i.test(noscript)) {
    return true;
  }
  return scripts > 0 && textOf($).length < APP_SHELL_TEXT;
}

function textOf($: CheerioAPI): string {
  $('script, style, noscript, template, svg').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function visibleText(html: string): string | null {
  try {
    return textOf(load(html));
  } catch {
    return null;
  }
}

/** A captcha widget or a password field on a page with less text than this is the whole page. */
const WALL_TEXT = 600;

/**
 * What stands between a crawler and the site, if anything:
 * - `challenge`: a bot interstitial (Cloudflare's "Just a moment...",
 *   DataDome, PerimeterX, Incapsula, DDoS-Guard) or a page that is little
 *   more than a CAPTCHA.
 * - `login`: a page that is little more than a password field.
 * A contact form with a reCAPTCHA or a "customer login" box on a full page is
 * not a wall. Neither crawl ever tries to pass one.
 */
export function pageWall(html: string): 'challenge' | 'login' | null {
  const head = html.slice(0, 300_000);
  if (
    /<title>\s*(just a moment|attention required|checking your browser|please wait while|ddos-guard)/i.test(head) ||
    /cf_chl_opt|cf-chl-widget|captcha-delivery\.com|px-captcha|_incapsula_resource|sucuri website firewall/i.test(head)
  ) {
    return 'challenge';
  }
  const captcha = /recaptcha\/api|google\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com\/turnstile|class=["'][^"']*(g-recaptcha|h-captcha|cf-turnstile)/i.test(head);
  const password = /<input\b[^>]*type\s*=\s*["']?password/i.test(head);
  if (!captcha && !password) return null;
  const text = visibleText(head);
  if (text === null || text.length >= WALL_TEXT) return null;
  return captcha ? 'challenge' : 'login';
}
