import type { Sql } from 'postgres';
import type { SearchKind } from '@nvoke/shared';
import type { Ai } from '../../ai/client.js';
import type { Env } from '../../env.js';
import { dropAdapter } from '../../feed/drops.js';
import type { CrawlDeps } from '../crawl.js';
import type { FetchLike } from '../http.js';
import { dbWebSearchCache } from '../web-cache.js';
import { domainsAdapter } from './domains.js';
import { icpAdapter } from './icp.js';
import { launchesAdapter } from './launches.js';
import { localAdapter } from './local.js';
import type { SourceAdapter } from './types.js';
import { braveClient, webAdapter } from './web.js';

export type AdapterRegistry = { [K in SearchKind]: SourceAdapter<unknown> };

/**
 * The source adapters, configured from the environment. With `sql`, web
 * results are cached; drop searches need it to read the feed. Describe your
 * customer (`icp`) needs `ai` to plan and score, and reads list pages with
 * `crawl` (the crawler's rate limit and robots.txt cache) when given.
 */
export function createAdapters(
  env: Pick<Env, 'NOMINATIM_URL' | 'OVERPASS_URL' | 'BRAVE_SEARCH_API_KEY' | 'BRAVE_REQUESTS_PER_SECOND' | 'PRODUCT_HUNT_TOKEN'> & Partial<Pick<Env, 'ICP_BRAVE_BUDGET'>>,
  opts: { fetch?: FetchLike; sql?: Sql; ai?: Ai; crawl?: CrawlDeps } = {},
): AdapterRegistry {
  const fetchImpl = opts.fetch;
  // One client, so web and domains searches share Brave's rate limit and cache.
  const brave = braveClient({
    apiKey: env.BRAVE_SEARCH_API_KEY,
    requestsPerSecond: env.BRAVE_REQUESTS_PER_SECOND,
    cache: opts.sql ? dbWebSearchCache(opts.sql) : undefined,
    fetch: fetchImpl,
  });
  const web = webAdapter(brave);
  const local = localAdapter({
    nominatimUrl: env.NOMINATIM_URL,
    overpassUrls: env.OVERPASS_URL,
    fetch: fetchImpl,
    // Overpass mirrors go down often: a web search fills in, when one is configured.
    webFallback: brave.configured ? web : undefined,
    // Places that list no website are looked up by name and city.
    placeLookup: brave.configured ? brave : undefined,
  });
  return {
    local: local as SourceAdapter<unknown>,
    web: web as SourceAdapter<unknown>,
    domains: domainsAdapter(brave) as SourceAdapter<unknown>,
    launches: launchesAdapter({ productHuntToken: env.PRODUCT_HUNT_TOKEN, fetch: fetchImpl }) as SourceAdapter<unknown>,
    drop: dropAdapter(() => {
      if (!opts.sql) throw new Error('drop searches need a database');
      return opts.sql;
    }) as SourceAdapter<unknown>,
    icp: icpAdapter({
      brave,
      ai: opts.ai,
      sql: opts.sql,
      // OpenStreetMap only: no Brave lookups or web fallback per pair, so local pairs stay free.
      local: localAdapter({ nominatimUrl: env.NOMINATIM_URL, overpassUrls: env.OVERPASS_URL, fetch: fetchImpl }),
      crawl: opts.crawl,
      braveBudget: env.ICP_BRAVE_BUDGET,
    }) as SourceAdapter<unknown>,
  };
}

export * from './types.js';
