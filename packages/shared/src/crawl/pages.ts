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

/**
 * Path and link text keywords, strongest first. English, the Nordic
 * languages, German, Dutch, French, Spanish, Italian, Portuguese, Polish and
 * Finnish, the languages of the countries nvoke sells to and their neighbours.
 */
const PAGE_HINTS: Array<{ re: RegExp; score: number }> = [
  {
    re: /kontakt|contact|kontakta|contatt|contacto|contato|yhteystiedot|ota-yhteytt|fale-conosco|nous-joindre|get-in-touch|reach-us|write-us|skriv-til-os|find-os|find-us|hitta-hit|anfahrt|ansprechpartner|\.vcf$/i,
    score: 100,
  },
  { re: /impressum|imprint|mentions-legales|aviso-legal|note-legali|colofon|colophon/i, score: 90 },
  {
    re: /\bteam\b|medarbejder|employees|our-people|\bpeople\b|staff|personale|ansatte|mitarbeiter|medarbetare|medewerkers|equipe|equipo|squadra|henkilokunta|zespol|vores-folk/i,
    score: 80,
  },
  {
    re: /about|om-os|omos|om-oss|ueber-uns|uber-uns|über|qui-sommes|a-propos|chi-siamo|sobre|over-ons|wie-zijn-wij|quienes-somos|quem-somos|o-nas|meista|tietoa|virksomheden|firmaet|unternehmen/i,
    score: 70,
  },
  { re: /privacy|privatliv|persondata|datenschutz|gdpr|personvern|integritet|privacidad|confidentialite|tietosuoja|rodo/i, score: 50 },
  { re: /legal|juridisk|vilkaar|terms|agb|cvr|handelsbetingelser|salgsbetingelser/i, score: 40 },
];

/**
 * Tried in this order when the homepage links to no likely page, and when
 * the pages it links to held no address.
 */
export const GUESSED_PATHS = ['/contact', '/kontakt', '/about', '/impressum', '/contact-us', '/kontakt-os', '/om-os', '/about-us'];

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|mov|webm|css|js|xml|json|txt)$/i;

/** How likely a page holds contact details, from its URL and link text. 0 means not at all. */
export function pageScore(url: URL, linkText = ''): number {
  const haystack = `${safeDecode(url.pathname)} ${linkText.slice(0, 80)}`;
  let score = 0;
  for (const hint of PAGE_HINTS) if (hint.re.test(haystack)) score = Math.max(score, hint.score);
  if (score === 0) return 0;
  // Shallow pages first: /kontakt beats /blog/2019/how-to-contact-us.
  score -= Math.min(60, (url.pathname.split('/').filter(Boolean).length - 1) * 25);
  if (url.search) score -= 5;
  return score;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The site's menus and footer, by element, role or the usual class and id names. */
const SITE_CHROME = 'header, nav, footer, [role="navigation"], [role="contentinfo"], [class*="footer"], [id*="footer"], [class*="menu"], [id*="menu"]';

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
    let score = pageScore(url, $(el).text());
    if (score === 0) return;
    // The site's own menus and footer link the pages it wants found.
    if ($(el).closest(SITE_CHROME).length > 0) score += 10;
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  });
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([url]) => url);
}

/** Longest last path segment a sitemap page may have. Contact pages have short names. */
const SITEMAP_MAX_SLUG = 40;

/** The likeliest contact pages a sitemap lists, best first. */
export function pickFromSitemap(urls: string[], max: number): string[] {
  const scored: Array<[string, number]> = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.pathname === '/' || SKIP_EXTENSIONS.test(url.pathname)) continue;
    // A long slug is a post that mentions contact ("how-to-contact-support-..."), not the contact page.
    const slug = url.pathname.split('/').filter(Boolean).pop() ?? '';
    if (slug.length > SITEMAP_MAX_SLUG) continue;
    const score = pageScore(url);
    if (score > 0) scored.push([url.toString(), score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([url]) => url);
}

/**
 * The pages to read after the homepage, best first: likely pages it links
 * to, then likely pages from the sitemap, then guessed paths.
 */
export function planPages(homeHtml: string, homeUrl: string, sitemapPages: string[], max: number): string[] {
  const out: string[] = [];
  const add = (url: string) => {
    if (out.length < max && !out.includes(url)) out.push(url);
  };
  for (const url of pickLikelyPages(homeHtml, homeUrl, max)) add(url);
  for (const url of pickFromSitemap(sitemapPages, max)) add(url);
  if (out.length === 0) {
    const origin = new URL(homeUrl).origin;
    for (const path of GUESSED_PATHS.slice(0, 3)) add(`${origin}${path}`);
  }
  return out;
}

/** Guessed paths not read yet, for a site whose likely pages held no address. */
export function fallbackPages(homeUrl: string, seen: Set<string>, max: number): string[] {
  const origin = new URL(homeUrl).origin;
  return GUESSED_PATHS.map((p) => `${origin}${p}`)
    .filter((u) => !seen.has(u) && !seen.has(`${u}/`))
    .slice(0, max);
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
