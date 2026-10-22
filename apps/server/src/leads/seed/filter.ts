// Which listed domains are worth a seed crawl. A popularity list is mostly
// not companies we can sell to: platforms and directories (the crawl rules'
// own lists), CDNs, ad and tracking hosts, cloud infrastructure, government,
// universities and adult sites. Everything left is crawled once; fit scoring
// still decides per search whether a company matches.

import { isPlatformDomain, isWebmailDomain, registrableDomain } from '../domain.js';
import { isDirectoryDomain, isSkippedHost } from '../listicle.js';

/** Infrastructure, CDN, ad, tracking and big tech hosts: serve other sites, sell nothing to our users' leads. */
const INFRA_SITES = new Set([
  'akamai.net', 'akamaiedge.net', 'akamaihd.net', 'akamaized.net', 'edgekey.net', 'edgesuite.net', 'cloudfront.net',
  'amazonaws.com', 'awsstatic.com', 'fastly.net', 'fastly.com', 'cloudflare.net', 'cloudflare.com', 'cloudflare-dns.com',
  'jsdelivr.net', 'unpkg.com', 'cdnjs.com', 'bootstrapcdn.com', 'jquery.com', 'fontawesome.com', 'typekit.net',
  'googleusercontent.com', 'googlevideo.com', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'googleapis.com', 'gstatic.com', 'doubleclick.net', 'ggpht.com', 'gvt1.com', 'withgoogle.com',
  'blogger.com', 'goo.gl', 'g.co', 'youtube.com', 'ytimg.com', 'fbcdn.net', 'facebook.net', 'cdninstagram.com',
  'twimg.com', 'licdn.com', 'azureedge.net', 'azurewebsites.net', 'windows.net', 'msedge.net', 'live.com',
  'office.com', 'office365.com', 'outlook.com', 'microsoftonline.com', 'bing.net', 'skype.com', 'msn.com',
  'icloud.com', 'mzstatic.com', 'apple-dns.net', 'adobe.com', 'adobedtm.com', 'demdex.net', 'omtrdc.net',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'adnxs.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'newrelic.com',
  'nr-data.net', 'sentry.io', 'segment.com', 'segment.io', 'mixpanel.com', 'optimizely.com', 'onetrust.com',
  'cookielaw.org', 'cookiebot.com', 'recaptcha.net', 'hcaptcha.com', 'gravatar.com', 'wp.com', 'wordpress.org',
  'w3.org', 'schema.org', 'ietf.org', 'iana.org', 'icann.org', 'mozilla.org', 'mozilla.net', 'shopify.com',
  'myshopify.com', 'squarespace.com', 'wix.com', 'wixstatic.com', 'godaddy.com', 'secureserver.net',
  'namecheap.com', 'domaincontrol.com', 'digicert.com', 'letsencrypt.org', 'sectigo.com', 'globalsign.com',
  'zoom.us', 'slack.com', 'dropbox.com', 'box.com', 'paypal.com', 'stripe.com', 'netflix.com', 'nflxvideo.net',
  'baidu.com', 'qq.com', 'weibo.com', 'sina.com.cn', 'yandex.ru', 'yandex.net', 'naver.com', 'line.me',
  'disqus.com', 'addthis.com', 'sharethis.com', 'tinyurl.com', 'bit.ly', 'issuu.com', 'scribd.com', 'slideshare.net',
  'flickr.com', 'imgur.com', 'giphy.com', 'pixabay.com', 'unsplash.com', 'shutterstock.com', 'gettyimages.com',
  'statcounter.com', 'addtoany.com', 'creativecommons.org', 'apache.org', 'php.net', 'python.org', 'nodejs.org',
]);

/** Top level domains of government, education, the military and adult sites. */
const SKIP_TLDS = new Set(['gov', 'edu', 'mil', 'int', 'xxx', 'porn', 'adult', 'sex', 'arpa', 'onion', 'test', 'example']);
/** Second level labels of the same: "nhs.gov.uk", "ox.ac.uk", "uni.edu.au". */
const SKIP_SECOND = new Set(['gov', 'gouv', 'gob', 'govt', 'go', 'gv', 'edu', 'ac', 'mil', 'nic', 'police', 'nhs', 'sch', 'k12']);
/** Labels that name an adult site or a public body outright. */
const SKIP_WORDS = /(^|[.-])(porn|xxx|sex|cams?|escort|hentai|casino|bet|gov|kommune|council)([.-]|$)/;

export type SeedSkip = 'platform' | 'webmail' | 'directory' | 'infrastructure' | 'public_or_adult';

/** Why a listed domain is not seeded, or null when it may be a company. */
export function seedSkipReason(domain: string): SeedSkip | null {
  const host = domain.toLowerCase();
  const site = registrableDomain(host);
  if (isPlatformDomain(host)) return 'platform';
  if (isWebmailDomain(host)) return 'webmail';
  if (isDirectoryDomain(host)) return 'directory';
  if (isSkippedHost(host) || INFRA_SITES.has(site)) return 'infrastructure';
  const labels = site.split('.');
  const tld = labels[labels.length - 1] ?? '';
  // "gov.uk" itself has two labels, "nhs.gov.uk" three: both are a ccTLD's public body.
  const second = labels.length > 2 || tld.length === 2 ? labels[labels.length - 2] : undefined;
  if (SKIP_TLDS.has(tld) || (second && SKIP_SECOND.has(second)) || SKIP_WORDS.test(host)) return 'public_or_adult';
  return null;
}
