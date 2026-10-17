// Companies from a web search, via the Brave Search API.
// https://api-dashboard.search.brave.com/app/documentation/web-search
//
// Result domains are deduplicated and platforms (social networks,
// marketplaces, Wikipedia, news) are dropped by the find job. Brave bills
// every request, so pages come from the shared cache when they can, and the
// find job stops pulling pages once the search has enough companies.

import type { WebSearchParams } from '@nvoke/shared';
import { normalizeDomain } from '../domain.js';
import { fetchJson, HttpError, type FetchLike } from '../http.js';
import { RateLimiter, sleep } from '../limits.js';
import type { CachedWebPage, WebSearchCache } from '../web-cache.js';
import { PermanentError, SourceUnavailableError, type FoundCompany, type SourceAdapter, type SourceContext } from './types.js';

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const PAGE_SIZE = 20;
/** Brave accepts offsets 0 to 9. */
const MAX_PAGES = 10;

/**
 * The countries Brave can scope results to. Any other country code is
 * rejected, so for those the country's English name joins the query instead.
 */
const BRAVE_COUNTRIES = new Set(
  'ar au at be br ca cl dk fi fr de hk in id it jp kr my mx nl nz no cn pl pt ph ru sa za es se ch tw tr gb us'.split(' '),
);
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** The query and country parameter for a search, given Brave's country support. */
export function braveQuery(params: WebSearchParams): { q: string; country?: string } {
  const country = params.country?.toLowerCase();
  if (!country) return { q: params.keyword };
  if (BRAVE_COUNTRIES.has(country)) return { q: params.keyword, country };
  const name = countryNames.of(country.toUpperCase());
  return { q: name && name !== country.toUpperCase() ? `${params.keyword} ${name}` : params.keyword };
}

export interface WebAdapterOptions {
  apiKey: string | undefined;
  fetch?: FetchLike;
  endpoint?: string;
  /** Requests per second the Brave plan allows. Default 1, the free plan. */
  requestsPerSecond?: number;
  cache?: WebSearchCache;
}

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
  profile?: { name?: string };
  meta_url?: { hostname?: string };
}

interface BraveResponse {
  web?: { results?: BraveResult[] };
  query?: { more_results_available?: boolean };
}

/** "Acme Dental | Best dentist in town" becomes "Acme Dental". */
export function nameFromTitle(title: string | undefined, domain: string): string {
  const clean = (title ?? '')
    .replace(/<[^>]+>/g, '')
    .split(/\s+[|\u2013\u2014\u00b7:-]\s+/)[0]
    ?.trim();
  if (clean && clean.length >= 2 && clean.length <= 120) return clean;
  const label = domain.split('.')[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** A result's text without Brave's highlight tags, collapsed and capped. */
function plain(text: string | undefined, max: number): string | undefined {
  const clean = (text ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean || undefined;
}

export function resultToCompany(r: BraveResult): FoundCompany | null {
  if (!r.url) return null;
  const domain = normalizeDomain(r.url);
  if (!domain) return null;
  let website: string;
  try {
    website = new URL(r.url).origin;
  } catch {
    return null;
  }
  return {
    name: nameFromTitle(r.profile?.name || r.title, domain),
    website,
    source: 'brave',
    sourceRef: r.url,
    category: undefined,
    ...(plain(r.title, 200) ? { title: plain(r.title, 200) } : {}),
    ...(plain(r.description, 400) ? { snippet: plain(r.description, 400) } : {}),
  };
}

/** A rate limit window Brave reports is spent for longer than this: not worth waiting for. */
const MAX_RATE_WAIT_S = 5;

/**
 * Seconds until Brave lets us in again after a 429, or null when a window
 * with a real limit is spent for longer than MAX_RATE_WAIT_S (the monthly
 * quota or the spend limit). Brave sends parallel lists per window, such as
 * `x-ratelimit-limit: 50, 0`, `x-ratelimit-remaining: 0, 0` and
 * `x-ratelimit-reset: 1, 1574023`. A limit of 0 means that window is unlimited.
 */
export function braveRetryAfter(headers: Headers | undefined): number | null {
  const list = (name: string) => (headers?.get(name) ?? '').split(',').map((v) => Number(v.trim()));
  const limit = list('x-ratelimit-limit');
  const remaining = list('x-ratelimit-remaining');
  const reset = list('x-ratelimit-reset');
  if (!headers?.get('x-ratelimit-reset')) return 1;
  let wait = 0;
  for (let i = 0; i < reset.length; i++) {
    if (!(limit[i]! > 0) || remaining[i]! > 0) continue;
    if (reset[i]! > MAX_RATE_WAIT_S) return null;
    wait = Math.max(wait, reset[i]!);
  }
  return Math.max(1, wait);
}

/** A key for the Brave cache and request: query, optional country, page number. */
export interface BravePageRequest {
  q: string;
  country?: string;
  page: number;
}

/**
 * Brave Search with the shared rate limit, the result cache and the refusal
 * rules from "Source costs". One client per key, shared by every adapter that
 * searches the web, so they draw from one rate limit.
 */
export interface BraveClient {
  /** False without an API key. */
  readonly configured: boolean;
  /** One result page, from the cache when it can. */
  page(req: BravePageRequest, ctx: SourceContext): Promise<CachedWebPage>;
}

export function braveClient(opts: WebAdapterOptions): BraveClient {
  // A tenth of headroom over the plan's rate, so clock jitter never trips a 429.
  const limiter = new RateLimiter(Math.ceil(1_100 / (opts.requestsPerSecond ?? 1)));

  const fetchPage = async (apiKey: string, req: BravePageRequest, ctx: SourceContext): Promise<CachedWebPage> => {
    const url = new URL(opts.endpoint ?? BRAVE_ENDPOINT);
    url.searchParams.set('q', req.q);
    url.searchParams.set('count', String(PAGE_SIZE));
    url.searchParams.set('offset', String(req.page));
    url.searchParams.set('safesearch', 'moderate');
    if (req.country) url.searchParams.set('country', req.country);

    let res: BraveResponse;
    for (let attempt = 1; ; attempt++) {
      await limiter.wait('brave', ctx.signal);
      try {
        res = await fetchJson<BraveResponse>(url.toString(), {
          fetch: opts.fetch,
          signal: ctx.signal,
          timeoutMs: 20_000,
          headers: { 'x-subscription-token': apiKey },
        });
        // Brave bills answered requests only.
        ctx.onUsage?.('request');
        break;
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const said = `${err.status} ${(err.bodySnippet ?? '').slice(0, 300)}`.trim();
        if (err.status === 401 || err.status === 402 || err.status === 403) {
          throw new SourceUnavailableError('brave', `the key or plan was refused (${said})`);
        }
        if (err.status !== 429) throw err;
        const wait = braveRetryAfter(err.headers);
        if (wait === null || attempt >= 3) {
          throw new SourceUnavailableError('brave', `the monthly quota or spend limit is reached (${said})`);
        }
        await sleep(wait * 1_000, ctx.signal);
      }
    }
    const results = res.web?.results ?? [];
    return {
      companies: results.map(resultToCompany).filter((c): c is FoundCompany => c !== null),
      more: results.length > 0 && res.query?.more_results_available !== false,
    };
  };

  return {
    configured: Boolean(opts.apiKey),
    async page(req, ctx) {
      if (!opts.apiKey) {
        throw new PermanentError(
          'web search is not configured on this server (BRAVE_SEARCH_API_KEY is not set)',
          'source_not_configured',
        );
      }
      const key = { q: req.q, country: req.country, page: req.page };
      const cached = await opts.cache?.get(key).catch((err: unknown) => {
        ctx.log.warn({ err }, 'brave: cache read failed');
        return null;
      });
      if (cached) {
        ctx.onUsage?.('cache_hit');
        return cached;
      }
      const result = await fetchPage(opts.apiKey, req, ctx);
      await opts.cache?.put(key, result).catch((err: unknown) => ctx.log.warn({ err }, 'brave: cache write failed'));
      return result;
    },
  };
}

export function webAdapter(opts: WebAdapterOptions | BraveClient): SourceAdapter<WebSearchParams> {
  const brave = 'page' in opts ? opts : braveClient(opts);
  return {
    kind: 'web',
    async *find(params, ctx) {
      const { q, country } = braveQuery(params);
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await brave.page({ q, country, page }, ctx);
        yield* result.companies;
        if (!result.more) return;
      }
    },
  };
}
