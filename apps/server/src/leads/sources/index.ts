import type { Sql } from 'postgres';
import type { SearchKind } from '@nvoke/shared';
import type { Env } from '../../env.js';
import { dropAdapter } from '../../feed/drops.js';
import type { FetchLike } from '../http.js';
import { dbWebSearchCache } from '../web-cache.js';
import { launchesAdapter } from './launches.js';
import { localAdapter } from './local.js';
import type { SourceAdapter } from './types.js';
import { webAdapter } from './web.js';

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
  return {
    local: localAdapter({ nominatimUrl: env.NOMINATIM_URL, overpassUrls: env.OVERPASS_URL, fetch: fetchImpl }) as SourceAdapter<unknown>,
    web: webAdapter({
      apiKey: env.BRAVE_SEARCH_API_KEY,
      requestsPerSecond: env.BRAVE_REQUESTS_PER_SECOND,
      cache: opts.sql ? dbWebSearchCache(opts.sql) : undefined,
      fetch: fetchImpl,
    }) as SourceAdapter<unknown>,
    launches: launchesAdapter({ productHuntToken: env.PRODUCT_HUNT_TOKEN, fetch: fetchImpl }) as SourceAdapter<unknown>,
    drop: dropAdapter(() => {
      if (!opts.sql) throw new Error('drop searches need a database');
      return opts.sql;
    }) as SourceAdapter<unknown>,
  };
}

export * from './types.js';
