import type { SearchKind } from '@nvoke/shared';
import type { Env } from '../../env.js';
import type { FetchLike } from '../http.js';
import { launchesAdapter } from './launches.js';
import { localAdapter } from './local.js';
import type { SourceAdapter } from './types.js';
import { webAdapter } from './web.js';

export type AdapterRegistry = { [K in SearchKind]: SourceAdapter<unknown> };

/** The three source adapters, configured from the environment. */
export function createAdapters(
  env: Pick<Env, 'NOMINATIM_URL' | 'OVERPASS_URL' | 'BRAVE_SEARCH_API_KEY' | 'PRODUCT_HUNT_TOKEN'>,
  fetchImpl?: FetchLike,
): AdapterRegistry {
  return {
    local: localAdapter({ nominatimUrl: env.NOMINATIM_URL, overpassUrls: env.OVERPASS_URL, fetch: fetchImpl }) as SourceAdapter<unknown>,
    web: webAdapter({ apiKey: env.BRAVE_SEARCH_API_KEY, fetch: fetchImpl }) as SourceAdapter<unknown>,
    launches: launchesAdapter({ productHuntToken: env.PRODUCT_HUNT_TOKEN, fetch: fetchImpl }) as SourceAdapter<unknown>,
  };
}

export * from './types.js';
