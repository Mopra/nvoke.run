import type { Sql } from 'postgres';
import type { SearchKind } from '@nvoke/shared';
import type { Env } from '../../env.js';
import { dropAdapter } from '../../feed/drops.js';
import type { FetchLike } from '../http.js';
import { dbWebSearchCache } from '../web-cache.js';
import { domainsAdapter } from './domains.js';
import { launchesAdapter } from './launches.js';
import { localAdapter } from './local.js';
import type { SourceAdapter } from './types.js';
import { braveClient, webAdapter } from './web.js';

export type AdapterRegistry = { [K in SearchKind]: SourceAdapter<unknown> };

/**
 * The source adapters, configured from the environment. With `sql`, web
 * results are cached; drop searches need it to read the feed.
 */
export function createAdapters(
  env: Pick<Env, 'NOMINATIM_URL' | 'OVERPASS_URL' | 'BRAVE_SEARCH_API_KEY' | 'BRAVE_REQUESTS_PER_SECOND' | 'PRODUCT_HUNT_TOKEN'>,
  opts: { fetch?: FetchLike; sql?: Sql } = {},
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
  return {
    local: localAdapter({
      nominatimUrl: env.NOMINATIM_URL,
      overpassUrls: env.OVERPASS_URL,
      fetch: fetchImpl,
      // Overpass mirrors go down often: a web search fills in, when one is configured.
      webFallback: brave.configured ? web : undefined,
      // Places that list no website are looked up by name and city.
      placeLookup: brave.configured ? brave : undefined,
    }) as SourceAdapter<unknown>,
    web: web as SourceAdapter<unknown>,
    domains: domainsAdapter(brave) as SourceAdapter<unknown>,
    launches: launchesAdapter({ productHuntToken: env.PRODUCT_HUNT_TOKEN, fetch: fetchImpl }) as SourceAdapter<unknown>,
    drop: dropAdapter(() => {
      if (!opts.sql) throw new Error('drop searches need a database');
      return opts.sql;
    }) as SourceAdapter<unknown>,
  };
}

export * from './types.js';
