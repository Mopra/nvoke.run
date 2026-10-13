// Domain normalization is what makes companies (search_id, domain) unique do
// its job: the same business reached through http, https, www and a deep link
// must collapse to one company. Ported from probe's core/url.ts.

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function parseUrl(input: string): URL | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length === 0 || /\s/.test(raw)) return null;
  // Sources hand us bare hosts often enough ("example.dk", "www.example.dk").
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/\//, '')}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

/** Lowercase host without "www." and trailing dots, or null when it is not a public host name. */
export function hostToDomain(hostname: string): string | null {
  let host = hostname.toLowerCase();
  while (host.endsWith('.')) host = host.slice(0, -1);
  if (host.startsWith('www.')) host = host.slice(4);
  if (host.length === 0 || host.length > 253) return null;
  if (IPV4.test(host)) return null;
  if (host.startsWith('[') || host.includes(':')) return null;
  if (!host.includes('.') || host.includes('..')) return null;
  for (const label of host.split('.')) {
    if (label.length === 0 || label.length > 63 || !LABEL.test(label)) return null;
  }
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (tld.length < 2 || /^[0-9]+$/.test(tld)) return null;
  if (host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) return null;
  return host;
}

/**
 * Lowercase host, strip "www.", drop scheme, port, path, query and fragment.
 * IDN hosts come back in punycode (the URL parser does that). Returns null when
 * the input is not an http(s) URL with a real public host.
 */
export function normalizeDomain(input: string): string | null {
  const url = parseUrl(input);
  if (!url) return null;
  return hostToDomain(url.hostname);
}

/** A canonical, fetchable website URL: https unless the input says http, no fragment. */
export function normalizeWebsite(input: string): string | null {
  const url = parseUrl(input);
  if (!url || !hostToDomain(url.hostname)) return null;
  url.hash = '';
  url.username = '';
  url.password = '';
  return url.toString();
}

/**
 * Second level labels under which a three label domain is still somebody's
 * registered domain: "acme.co.uk", "shop.com.au". Deliberately small; a full
 * public suffix list is not worth the weight for this one comparison.
 */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc', 'me', 'or', 'ne', 'gv']);

/** "mail.shop.acme.co.uk" becomes "acme.co.uk", "blog.acme.dk" becomes "acme.dk". */
export function registrableDomain(domain: string): string {
  const labels = domain.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1] ?? '';
  const second = labels[labels.length - 2] ?? '';
  const take = tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** True when both hosts share a registrable domain. */
export function sameSite(a: string, b: string): boolean {
  return registrableDomain(a) === registrableDomain(b);
}

/**
 * Shared webmail and freemail providers. An address on one belongs to a
 * person, whatever its local part says (info.acme@gmail.com is somebody's
 * own mailbox), so it is classified personal and never cached. The public
 * opt-out also refuses these as whole domains (privacy/target.ts).
 * WEBMAIL_BRANDS match the first label of the registrable domain, which
 * covers every country variant (yahoo.dk, hotmail.co.uk, outlook.de).
 */
const WEBMAIL_BRANDS = new Set([
  'gmail', 'googlemail', 'hotmail', 'outlook', 'live', 'msn', 'windowslive', 'yahoo', 'ymail', 'rocketmail',
  'icloud', 'protonmail', 'aol', 'gmx', 'yandex', 'zoho', 'fastmail', 'tutanota', 'mailbox',
]);
const WEBMAIL_DOMAINS = new Set([
  'me.com', 'mac.com', 'proton.me', 'pm.me', 'tuta.io', 'tuta.com', 'hey.com', 'mail.com', 'email.com',
  'web.de', 't-online.de', 'freenet.de', 'mail.ru', 'inbox.ru', 'qq.com', '163.com', 'laposte.net',
  'orange.fr', 'free.fr', 'libero.it', 'online.no',
  // Danish
  'mail.dk', 'jubii.dk', 'ofir.dk', 'sol.dk', 'email.dk', 'get2net.dk', 'webspeed.dk', 'stofanet.dk',
  'youmail.dk', 'privat.dk', 'tdcadsl.dk', 'tele.dk', 'tele2adsl.dk', 'city.dk', 'worldonline.dk',
]);

export function isWebmailDomain(domain: string): boolean {
  const host = domain.toLowerCase();
  const site = registrableDomain(host);
  return WEBMAIL_DOMAINS.has(host) || WEBMAIL_DOMAINS.has(site) || WEBMAIL_BRANDS.has(site.split('.')[0] ?? '');
}

/**
 * Platforms that are never "the company's website": social networks,
 * marketplaces, directories, encyclopedias, news, link-in-bio and app stores.
 * A lead source that points at one of these has not found a company domain.
 */
const PLATFORM_DOMAINS = [
  // Social
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 't.co',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'snapchat.com', 'threads.net', 'reddit.com',
  'tumblr.com', 'vk.com', 'whatsapp.com', 'wa.me', 'telegram.org', 't.me', 'discord.com', 'discord.gg',
  'mastodon.social', 'bsky.app', 'quora.com',
  // Link in bio and site builders' shared hosts
  'linktr.ee', 'linkin.bio', 'beacons.ai', 'carrd.co', 'about.me', 'sites.google.com', 'business.site',
  'wixsite.com', 'blogspot.com', 'wordpress.com', 'github.io', 'notion.site', 'notion.so', 'substack.com',
  'medium.com', 'webflow.io', 'vercel.app', 'netlify.app', 'pages.dev', 'herokuapp.com', 'framer.website',
  'workers.dev', 'fly.dev', 'onrender.com', 'replit.app', 'repl.co', 'glitch.me', 'railway.app', 'streamlit.app',
  'huggingface.co', 'itch.io', 'gumroad.com', 'lemonsqueezy.com', 'chromewebstore.google.com', 'addons.mozilla.org',
  // Marketplaces, reviews, directories, booking
  'amazon.com', 'amazon.co.uk', 'amazon.de', 'ebay.com', 'etsy.com', 'aliexpress.com', 'alibaba.com',
  'yelp.com', 'tripadvisor.com', 'trustpilot.com', 'google.com', 'goo.gl', 'maps.app.goo.gl', 'g.page',
  'apple.com', 'apps.apple.com', 'play.google.com', 'microsoft.com', 'booking.com', 'airbnb.com',
  'expedia.com', 'hotels.com', 'opentable.com', 'thefork.com', 'just-eat.com', 'wolt.com', 'ubereats.com',
  'doordash.com', 'deliveroo.com', 'yellowpages.com', 'yell.com', 'krak.dk', 'degulesider.dk', 'eniro.se',
  'gulesider.no', 'dasoertliche.de', 'gelbeseiten.de', 'pagesjaunes.fr', 'paginegialle.it', 'bbb.org',
  'crunchbase.com', 'glassdoor.com', 'indeed.com', 'angel.co', 'wellfound.com', 'producthunt.com',
  'news.ycombinator.com', 'ycombinator.com', 'g2.com', 'capterra.com', 'clutch.co', 'upwork.com',
  'fiverr.com', 'foursquare.com', 'zomato.com', 'groupon.com', 'doctolib.fr', 'zocdoc.com', 'healthgrades.com',
  'houzz.com', 'thumbtack.com', 'angi.com', 'checkatrade.com', 'treatwell.com', 'fresha.com', 'planity.com',
  'proff.dk', 'cvr.dk', 'virk.dk', 'opencorporates.com', 'companieshouse.gov.uk',
  // Encyclopedias, code hosting, news
  'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'wiktionary.org', 'fandom.com', 'github.com', 'gitlab.com',
  'bitbucket.org', 'npmjs.com', 'pypi.org', 'stackoverflow.com', 'archive.org', 'imdb.com',
  'nytimes.com', 'bbc.co.uk', 'bbc.com', 'cnn.com', 'theguardian.com', 'forbes.com', 'bloomberg.com',
  'reuters.com', 'wsj.com', 'washingtonpost.com', 'businessinsider.com', 'techcrunch.com', 'theverge.com',
  'wired.com', 'huffpost.com', 'dr.dk', 'tv2.dk', 'politiken.dk', 'berlingske.dk', 'bt.dk', 'eb.dk', 'spiegel.de',
  'zeit.de', 'lemonde.fr', 'elpais.com', 'news.google.com', 'yahoo.com', 'msn.com', 'bing.com',
  'duckduckgo.com', 'youtube-nocookie.com', 'vimeo.com', 'twitch.tv', 'spotify.com', 'soundcloud.com',
];

const PLATFORM_SET = new Set(PLATFORM_DOMAINS);

/** True for the domain itself or any subdomain of a platform. */
export function isPlatformDomain(domain: string): boolean {
  const host = domain.toLowerCase();
  if (PLATFORM_SET.has(host)) return true;
  let dot = host.indexOf('.');
  while (dot !== -1) {
    const parent = host.slice(dot + 1);
    if (PLATFORM_SET.has(parent)) return true;
    dot = host.indexOf('.', dot + 1);
  }
  // Every national Wikipedia, Google and Amazon.
  return /(^|\.)(wikipedia|google|amazon|ebay)\.[a-z.]{2,6}$/.test(host);
}
