// Companies from a web search, via the Brave Search API.
// https://api-dashboard.search.brave.com/app/documentation/web-search
//
// Result domains are deduplicated and platforms (social networks,
// marketplaces, Wikipedia, news) are dropped by the find job. Brave bills
// every request, so pages come from the shared cache when they can, and the
// find job stops pulling pages once the search has enough companies.

import type { WebSearchParams } from '@nvoke/shared';
import { normalizeDomain } from '../domain.js';
import { fetchJson, type FetchLike } from '../http.js';
import { RateLimiter } from '../limits.js';
import type { WebSearchCache } from '../web-cache.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';

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
  };
}

export function webAdapter(opts: WebAdapterOptions): SourceAdapter<WebSearchParams> {
  // A tenth of headroom over the plan's rate, so clock jitter never trips a 429.
  const limiter = new RateLimiter(Math.ceil(1_100 / (opts.requestsPerSecond ?? 1)));
  return {
    kind: 'web',
    async *find(params, ctx) {
      if (!opts.apiKey) {
        throw new PermanentError(
          'web search is not configured on this server (BRAVE_SEARCH_API_KEY is not set)',
          'source_not_configured',
        );
      }
      const apiKey = opts.apiKey;
      const { q, country } = braveQuery(params);

      const fetchPage = async (page: number): Promise<{ companies: FoundCompany[]; more: boolean }> => {
        const url = new URL(opts.endpoint ?? BRAVE_ENDPOINT);
        url.searchParams.set('q', q);
        url.searchParams.set('count', String(PAGE_SIZE));
        url.searchParams.set('offset', String(page));
        url.searchParams.set('safesearch', 'moderate');
        if (country) url.searchParams.set('country', country);

        await limiter.wait('brave', ctx.signal);
        ctx.onUsage?.('request');
        const res = await fetchJson<BraveResponse>(url.toString(), {
          fetch: opts.fetch,
          signal: ctx.signal,
          timeoutMs: 20_000,
          headers: { 'x-subscription-token': apiKey },
        });
        const results = res.web?.results ?? [];
        return {
          companies: results.map(resultToCompany).filter((c): c is FoundCompany => c !== null),
          more: results.length > 0 && res.query?.more_results_available !== false,
        };
      };

      for (let page = 0; page < MAX_PAGES; page++) {
        const key = { q, country, page };
        let result = await opts.cache?.get(key).catch((err: unknown) => {
          ctx.log.warn({ err }, 'web: cache read failed');
          return null;
        });
        if (result) {
          ctx.onUsage?.('cache_hit');
        } else {
          result = await fetchPage(page);
          await opts.cache?.put(key, result).catch((err: unknown) => ctx.log.warn({ err }, 'web: cache write failed'));
        }
        yield* result.companies;
        if (!result.more) return;
      }
    },
  };
}
