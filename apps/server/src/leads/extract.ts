// Email extraction from company web pages. Pure and IO free so it can be
// tested against fixture HTML. Ported from probe's contact/extract.ts and
// extended for a lead finder: role addresses such as info@ are kept (they are
// what a business publishes), and more obfuscations are undone (Cloudflare
// email protection, JSON-LD, Danish and German spellings, string
// concatenation in inline scripts).
//
// The bias is still towards refusing junk: image names, placeholders, error
// collector DSNs and platform addresses never become leads.

import { load, type CheerioAPI } from 'cheerio';
import { registrableDomain, sameSite } from './domain.js';

export type FoundVia = 'mailto' | 'text' | 'obfuscated' | 'cfemail' | 'jsonld' | 'script';

export interface EmailCandidate {
  /** Raw address as found, before normalization. */
  email: string;
  via: FoundVia;
}

export interface ExtractedEmail {
  address: string;
  kind: 'generic' | 'personal';
  via: FoundVia;
  sourceUrl: string | null;
}

// Bounded quantifiers on purpose: an unbounded local part makes this regex
// quadratic on long runs of letters (inline base64, minified data), which a
// 2 MB page can turn into minutes. The lookbehind refuses to start a match in
// the middle of a word, so "søren@acme.dk" is not read as "ren@acme.dk".
const EMAIL_RE =
  /(?<![\p{L}\p{N}._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/gu;

const ILLEGAL_LOCAL = /[^a-z0-9!#$%&'*+/=?^_`{|}~.-]/;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Lowercase, trim, peel "mailto:", "<...>" and a "?query", validate the shape.
 * Returns null for anything that is not one plausible address. Unlike probe,
 * a +tag is kept: the address is reported exactly as the business published it.
 */
export function normalizeEmail(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1).trim();
  if (/^mailto:/i.test(s)) s = s.slice(7).trim();
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q).trim();
  s = s.toLowerCase().replace(/^[.'"(]+|[.'")]+$/g, '');

  if (s.length === 0 || s.length > 254 || /\s/.test(s)) return null;
  const parts = s.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts as [string, string];
  if (local.length === 0 || local.length > 64 || ILLEGAL_LOCAL.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !DOMAIN_LABEL.test(label)) return null;
  }
  const tld = labels[labels.length - 1] ?? '';
  if (tld.length < 2 || /[0-9]/.test(tld)) return null;
  return `${local}@${domain}`;
}

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}

export function localPartOf(address: string): string {
  return address.slice(0, address.lastIndexOf('@'));
}

/** `logo@2x.png` and friends match the shape of an address and are never one. */
const ASSET_SUFFIXES = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'heic', 'css', 'js', 'mjs',
  'json', 'map', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'pdf', 'zip', 'php',
  'html', 'htm', 'asp', 'aspx', 'xml', 'txt',
];
const ASSET_TLD = new Set(ASSET_SUFFIXES);

/** Hosts that belong to a platform, CDN or error collector, never to the business. */
const THIRD_PARTY_HOSTS = [
  'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com', 'wix.com', 'wordpress.com', 'wordpress.org',
  'automattic.com', 'squarespace.com', 'shopify.com', 'godaddy.com', 'namecheap.com', 'cloudflare.com',
  'googleapis.com', 'gstatic.com', 'google-analytics.com', 'googletagmanager.com', 'fontawesome.com',
  'jsdelivr.net', 'unpkg.com', 'cdnjs.com', 'bootstrapcdn.com', 'typekit.net', 'w3.org', 'schema.org',
  'mozilla.org', 'jquery.com', 'githubusercontent.com', 'vercel.com', 'netlify.com', 'webflow.com',
  'framer.com', 'mailchimp.com', 'list-manage.com', 'hubspot.com', 'intercom.io', 'zendesk.com',
  'stripe.com', 'paddle.com', 'facebook.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'instagram.com',
  'tiktok.com', 'pinterest.com', 'one.com', 'simply.com', 'unoeuro.com', 'dandomain.dk', 'smartweb.dk',
  'domainsbyproxy.com', 'whoisprivacyservice.org', 'withheldforprivacy.com', 'contactprivacy.com',
  'privacyguardian.org', 'cookiebot.com', 'usercentrics.eu', 'onetrust.com', 'trustpilot.com',
];

/** Placeholder and documentation domains that templates ship with. */
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu', 'example.dk', 'example.de', 'domain.com',
  'domain.dk', 'yourdomain.com', 'yourdomain.dk', 'yoursite.com', 'youremail.com', 'yourcompany.com',
  'email.com', 'mail.com.invalid', 'mydomain.com', 'company.com', 'firma.dk', 'virksomhed.dk',
  'test.com', 'test.dk', 'site.com', 'website.com', 'mysite.com', 'acme.com', 'sample.com', 'xyz.com',
  'beispiel.de', 'musterfirma.de', 'mustermann.de', 'exemple.fr', 'ejemplo.com', 'esempio.it',
]);

const PLACEHOLDER_SUFFIXES = ['.example', '.invalid', '.local', '.localhost', '.test', '.example.com'];

const PLACEHOLDER_LOCALS = new Set([
  'you', 'your', 'youremail', 'your-email', 'your.email', 'yourname', 'your-name', 'your.name', 'name',
  'navn', 'username', 'user', 'someone', 'somebody', 'test', 'testing', 'example', 'eksempel', 'foo', 'bar',
  'lorem', 'ipsum', 'placeholder', 'sample', 'dummy', 'johndoe', 'john.doe', 'janedoe', 'jane.doe',
  'firstname', 'lastname', 'first.last', 'firstname.lastname', 'fornavn', 'efternavn', 'max.mustermann',
  'sentry', 'email', 'e-mail', 'mail@mail', 'xxx', 'xx', 'abc',
]);

/** Machine mailboxes. Published, but nobody reads them. */
const NO_REPLY = /^(no[-._]?reply|do[-._]?not[-._]?reply|donotreply|noreply[-._].*|bounces?|mailer[-._]?daemon|postmaster|hostmaster|devnull|nobody)$/;

/** Why the address is junk, or null when it may be a real business address. */
export function rejectReason(address: string): string | null {
  const local = localPartOf(address);
  const domain = domainOf(address);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);

  if (ASSET_TLD.has(tld)) return 'asset file name';
  if (/@\d+x\./.test(address) || /^\d+x$/.test(local)) return 'asset file name';
  if (PLACEHOLDER_DOMAINS.has(domain)) return 'placeholder domain';
  if (PLACEHOLDER_SUFFIXES.some((s) => domain.endsWith(s))) return 'placeholder domain';
  if (PLACEHOLDER_LOCALS.has(local)) return 'placeholder local part';
  if (THIRD_PARTY_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`))) return 'platform address';
  if (NO_REPLY.test(local)) return 'no-reply mailbox';

  // Generated rather than chosen by a person: tracking ids, DSN keys, hashes.
  if (local.length > 40) return 'local part too long';
  if (/^[0-9a-f]{16,}$/.test(local)) return 'hex token';
  if (/^[0-9a-f]{8,}$/.test(local) && /[0-9]/.test(local) && /[a-f]/.test(local)) return 'hex token';
  const alnum = local.replace(/[^a-z0-9]/g, '');
  const digits = local.replace(/[^0-9]/g, '').length;
  if (alnum.length > 0 && digits === alnum.length && digits > 4) return 'all digits';
  if (/[b-df-hj-np-tv-xz]{7,}/.test(local)) return 'no vowels';
  return null;
}

/** Normalized address, or null when it is malformed or junk. */
export function acceptAddress(raw: string): string | null {
  const norm = normalizeEmail(raw);
  if (!norm) return null;
  return rejectReason(norm) ? null : norm;
}

/** Local parts that name a function rather than a person. */
const GENERIC_LOCALS = new Set([
  'info', 'information', 'contact', 'contacts', 'kontakt', 'hello', 'hej', 'hi', 'hallo', 'hola', 'bonjour',
  'mail', 'email', 'post', 'postkasse', 'office', 'kontor', 'sales', 'salg', 'verkauf', 'vertrieb', 'support',
  'help', 'hjaelp', 'admin', 'administration', 'team', 'booking', 'bookings', 'book', 'reservation',
  'reservations', 'bestilling', 'order', 'orders', 'ordre', 'shop', 'butik', 'webshop', 'store', 'reception',
  'service', 'kundeservice', 'customerservice', 'customer.service', 'enquiries', 'enquiry', 'inquiries',
  'inquiry', 'general', 'billing', 'accounts', 'accounting', 'regnskab', 'bogholderi', 'faktura', 'invoice',
  'invoices', 'finance', 'okonomi', 'jobs', 'job', 'careers', 'career', 'karriere', 'hr', 'recruiting',
  'press', 'presse', 'media', 'marketing', 'pr', 'privacy', 'gdpr', 'dpo', 'datapolitik', 'legal', 'compliance',
  'webmaster', 'web', 'it', 'security', 'abuse', 'events', 'partners', 'partner', 'hq', 'studio', 'clinic',
  'klinik', 'praksis', 'tandlaege', 'kanzlei', 'buero', 'büro', 'mail.info', 'feedback', 'newsletter',
  'nyhedsbrev', 'social', 'community', 'membership', 'medlem', 'members', 'school', 'skole', 'kontoret',
  'secretary', 'sekretariat', 'frontdesk', 'front.desk', 'helpdesk', 'servicedesk', 'operations', 'ops',
  'logistics', 'lager', 'warehouse', 'purchasing', 'indkob', 'procurement', 'export', 'import', 'quote',
  'quotes', 'tilbud', 'rental', 'udlejning', 'kontaktos', 'contactus', 'contact.us', 'ask',
  'questions', 'spoergsmaal', 'general.inquiries', 'welcome', 'velkommen', 'hello.world',
]);

const GENERIC_PREFIX = /^(info|contact|kontakt|support|sales|salg|booking|service|office|admin|post|mail|hello|team)[._-]/;

export function classifyAddress(address: string): 'generic' | 'personal' {
  const local = localPartOf(address).split('+')[0] ?? '';
  if (GENERIC_LOCALS.has(local) || GENERIC_PREFIX.test(local)) return 'generic';
  return 'personal';
}

/**
 * Undoes the usual ways an address is hidden from a naive scraper. The
 * spelled out form ("name at domain dot com") is only matched as a whole
 * address, never by replacing every " at " in prose.
 */
export function deobfuscate(input: string): string {
  let out = input;

  out = out.replace(/&#0*64;|&commat;|&#x0*40;/gi, '@');
  out = out.replace(/&#0*46;|&period;|&#x0*2e;/gi, '.');
  out = out.replace(/\\u0040/gi, '@').replace(/\\u002e/gi, '.');

  const AT = '(?:at|@|ät|snabel-?a|arroba|chez|klammeraffe)';
  const DOT = '(?:dot|punkt|punktum|prik|point|punto|\\.)';
  // Bracketed forms are unambiguous and safe to replace anywhere.
  out = out.replace(new RegExp(`\\s*[\\[({<]\\s*${AT}\\s*[\\])}>]\\s*`, 'gi'), '@');
  out = out.replace(new RegExp(`\\s*[\\[({<]\\s*${DOT}\\s*[\\])}>]\\s*`, 'gi'), '.');
  // Spelled out with words, matched as a complete address so prose is left alone.
  out = out.replace(
    /\b([A-Za-z0-9._%+-]{1,64})\s+(?:at|AT|ät|snabel-?a)\s+([A-Za-z0-9-]{1,63}(?:\s+(?:dot|DOT|punkt|punktum)\s+[A-Za-z0-9-]{1,63}){0,6})\s+(?:dot|DOT|punkt|punktum)\s+([A-Za-z]{2,24})\b/g,
    (_m, local: string, host: string, tld: string) =>
      `${local}@${host.replace(/\s+(?:dot|DOT|punkt|punktum)\s+/g, '.')}.${tld}`,
  );

  // " @ " with padding, on one or both sides (an "@" in its own <span> ends up like this).
  out = out.replace(/\s+@\s+/g, '@');
  out = out.replace(/([A-Za-z0-9._%+-])@\s+(?=[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b)/g, '$1@');
  out = out.replace(/(\b[A-Za-z0-9._%+-]{1,64})\s+@(?=[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b)/g, '$1@');
  return out;
}

/** Cloudflare "email protection": the first byte is an XOR key for the rest. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2 !== 0) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  const bytes: number[] = [];
  for (let i = 2; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return Buffer.from(bytes).toString('utf8');
}

/** Escapes that hide an address in JSON blobs and query strings. */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\\u003[ce]/gi, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/%40/gi, '@')
    .replace(/%3a/gi, ':')
    .replace(/%20/g, ' ');
}

function matchesIn(text: string, via: FoundVia): EmailCandidate[] {
  const out: EmailCandidate[] = [];
  for (const m of text.matchAll(EMAIL_RE)) out.push({ email: m[0], via });
  return out;
}

export function extractFromText(text: string): EmailCandidate[] {
  const cleaned = cleanText(text);
  const plain = matchesIn(cleaned, 'text');
  const seen = new Set(plain.map((c) => c.email.toLowerCase()));
  const hidden = matchesIn(deobfuscate(cleaned), 'obfuscated').filter((c) => !seen.has(c.email.toLowerCase()));
  return [...plain, ...hidden];
}

function mailtoAddresses(href: string): string[] {
  const value = href.trim();
  if (!/^mailto:/i.test(value)) return [];
  let rest = value.slice('mailto:'.length).split('?')[0] ?? '';
  try {
    rest = decodeURIComponent(rest);
  } catch {
    // A malformed escape is not worth failing the page over.
  }
  return rest
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function jsonLdEmails(raw: string): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key.toLowerCase() === 'email' && typeof value === 'string') out.push(value.replace(/^mailto:/i, ''));
      else if (typeof value === 'object') visit(value);
    }
  };
  try {
    visit(JSON.parse(raw));
  } catch {
    // Invalid JSON-LD is common. Fall back to the "email" values in the raw text.
    for (const m of raw.matchAll(/"email"\s*:\s*"(?:mailto:)?([^"]+)"/gi)) if (m[1]) out.push(m[1]);
  }
  return out;
}

/** "info" + "@" + "acme.dk" in inline scripts, joined back together. */
function scriptEmails(code: string): EmailCandidate[] {
  const joined = code.replace(/["']\s*\+\s*["']/g, '');
  return matchesIn(joined, 'script');
}

function collectFromDom($: CheerioAPI): { candidates: EmailCandidate[]; text: string } {
  const candidates: EmailCandidate[] = [];

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    for (const address of mailtoAddresses(href)) candidates.push({ email: address, via: 'mailto' });
    const cf = /\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/i.exec(href)?.[1];
    if (cf) {
      const decoded = decodeCfEmail(cf);
      if (decoded) candidates.push({ email: decoded, via: 'cfemail' });
    }
  });
  $('[data-cfemail]').each((_i, el) => {
    const decoded = decodeCfEmail($(el).attr('data-cfemail') ?? '');
    if (decoded) candidates.push({ email: decoded, via: 'cfemail' });
  });
  $('script[type="application/ld+json"]').each((_i, el) => {
    for (const email of jsonLdEmails($(el).text())) candidates.push({ email, via: 'jsonld' });
  });
  $('script:not([src]):not([type="application/ld+json"])').each((_i, el) => {
    const code = $(el).text();
    if (code.length < 200_000 && /["']\s*\+\s*["']/.test(code)) candidates.push(...scriptEmails(code));
  });
  // Visible text plus attribute values people put addresses in.
  $('[title], [data-email], [content]').each((_i, el) => {
    for (const attr of ['title', 'data-email', 'content']) {
      const v = $(el).attr(attr);
      if (v && v.includes('@')) candidates.push(...matchesIn(cleanText(v), 'text'));
    }
  });

  $('script, style, noscript, svg, template').remove();
  // Separators before flattening, so an address in its own tag does not fuse with the next word.
  $('p, br, div, li, tr, td, th, dd, dt, h1, h2, h3, h4, h5, h6, section, article, footer, header, span, a, address').after(' ');
  const text = $('body').text() || $.root().text();
  return { candidates, text };
}

/** Every candidate on an HTML page, in discovery order: links, encoded forms, then text. */
export function extractCandidates(html: string): EmailCandidate[] {
  if (!html) return [];
  let candidates: EmailCandidate[] = [];
  let text: string;
  try {
    const parsed = collectFromDom(load(html));
    candidates = parsed.candidates;
    text = parsed.text;
  } catch {
    text = html;
  }
  const seen = new Set(candidates.map((c) => c.email.toLowerCase()));
  for (const candidate of extractFromText(text)) {
    const key = candidate.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

/** Accepted addresses from one page, deduplicated, with how each was found. */
export function extractEmails(html: string, sourceUrl: string | null = null): ExtractedEmail[] {
  const out = new Map<string, ExtractedEmail>();
  for (const candidate of extractCandidates(html)) {
    const address = acceptAddress(candidate.email);
    if (!address || out.has(address)) continue;
    out.set(address, { address, kind: classifyAddress(address), via: candidate.via, sourceUrl });
  }
  return [...out.values()];
}

/**
 * Final selection for a company. Addresses on the company's own site win:
 * when any exist, addresses on unrelated domains are dropped (they are
 * usually the web agency, a supplier or a newsletter tool). When none exist,
 * the others are kept, because a small business on gmail.com is still a lead.
 * Addresses found only inside scripts are kept only on the company's own site.
 */
export function selectForCompany(found: ExtractedEmail[], companyDomains: string | string[]): ExtractedEmail[] {
  const sites = (Array.isArray(companyDomains) ? companyDomains : [companyDomains]).map(registrableDomain);
  const unique = new Map<string, ExtractedEmail>();
  for (const e of found) if (!unique.has(e.address)) unique.set(e.address, e);
  const all = [...unique.values()];
  const own = all.filter((e) => sites.some((site) => sameSite(domainOf(e.address), site)));
  if (own.length > 0) return own;
  return all.filter((e) => e.via !== 'script');
}
