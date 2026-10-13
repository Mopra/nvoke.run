// Cached Brave Search result pages (migration 0400_source_costs). Brave
// bills every request, so a page fetched for one search is reused by any
// search with the same query and country for RETENTION.webSearchCacheDays.

import type { Sql } from 'postgres';
import { RETENTION } from './retention.js';
import type { FoundCompany } from './sources/types.js';

export interface WebPageKey {
  q: string;
  country?: string;
  page: number;
}

export interface CachedWebPage {
  companies: FoundCompany[];
  /** Whether Brave said more pages exist after this one. */
  more: boolean;
}

export interface WebSearchCache {
  get(key: WebPageKey): Promise<CachedWebPage | null>;
  put(key: WebPageKey, page: CachedWebPage): Promise<void>;
}

/** "  Dentists   Berlin " and "dentists berlin" share a cache entry. */
export function cacheQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The cache on the web_search_cache table. */
export function dbWebSearchCache(sql: Sql, now: () => Date = () => new Date()): WebSearchCache {
  return {
    async get(key) {
      const [row] = await sql<{ companies: FoundCompany[]; more: boolean }[]>`
        select companies, more from web_search_cache
        where query = ${cacheQuery(key.q)} and country = ${key.country ?? ''} and page = ${key.page}
          and fetched_at > ${now().toISOString()}::timestamptz - make_interval(days => ${RETENTION.webSearchCacheDays})
      `;
      return row ? { companies: row.companies, more: row.more } : null;
    },
    async put(key, page) {
      await sql`
        insert into web_search_cache (query, country, page, companies, more, fetched_at)
        values (${cacheQuery(key.q)}, ${key.country ?? ''}, ${key.page}, ${sql.json(page.companies as never)}, ${page.more}, ${now().toISOString()})
        on conflict (query, country, page) do update
        set companies = excluded.companies, more = excluded.more, fetched_at = excluded.fetched_at
      `;
    },
  };
}
