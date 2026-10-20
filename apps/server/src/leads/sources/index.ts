import type { Sql } from 'postgres';
import type { SearchKind } from '@nvoke/shared';
import type { Ai } from '../../ai/client.js';
import type { Alerter } from '../../alerts.js';
import type { Env } from '../../env.js';
import { dropAdapter } from '../../feed/drops.js';
import type { CrawlDeps } from '../crawl.js';
import type { FetchLike } from '../http.js';
import { pauseSource, SOURCE_PAUSE_MS } from '../source-pause.js';
import { dbWebSearchCache } from '../web-cache.js';
import { domainsAdapter } from './domains.js';
import { FREE_BLOCK_MS, freeClient, freeSearchMode, mwmblProvider, searchClient, type FreeSearchMode } from './free-search.js';
import { icpAdapter } from './icp.js';
import { launchesAdapter } from './launches.js';
import { localAdapter } from './local.js';
import { nameResolver } from './resolve-name.js';
import { paidSearchChain, paidSearchFromEnv, SEARCH_DASHBOARDS, type PaidSearchEnv } from './paid-search.js';
import type { SourceAdapter, SourceUnavailableError } from './types.js';
import { webAdapter } from './web.js';

export type AdapterRegistry = { [K in SearchKind]: SourceAdapter<unknown> };

/**
 * The source adapters, configured from the environment. With `sql`, web
 * results are cached; drop searches need it to read the feed. Describe your
 * customer (`icp`) needs `ai` to plan and score, and reads list pages with
 * `crawl` (the crawler's rate limit and robots.txt cache) when given.
 *
 * Web search is Brave with a free provider behind it (FREE_SEARCH, see
 * free-search.ts): when Brave refuses us it is paused (and the operator
 * alerted through `alert`) and the free provider answers until the pause
 * runs out. Only when both are out does a search fail with source_unavailable.
 * WEB_SEARCH_PROVIDER and WEB_SEARCH_FALLBACK put Serper ahead of or behind
 * Brave (paid-search.ts); Mwmbl stays the last fallback behind both.
 */
export function createAdapters(
  env: Pick<Env, 'NOMINATIM_URL' | 'OVERPASS_URL' | 'BRAVE_SEARCH_API_KEY' | 'BRAVE_REQUESTS_PER_SECOND' | 'PRODUCT_HUNT_TOKEN'> &
    Partial<Pick<Env, 'ICP_BRAVE_BUDGET' | 'FREE_SEARCH' | 'FREE_SEARCH_INTERVAL_MS'>> &
    PaidSearchEnv,
  opts: { fetch?: FetchLike; sql?: Sql; ai?: Ai; crawl?: CrawlDeps; alert?: Alerter } = {},
): AdapterRegistry {
  const fetchImpl = opts.fetch;
  const sql = opts.sql;
  const cache = sql ? dbWebSearchCache(sql) : undefined;
  const chain = paidSearchChain(env);
  const isPaused = async (sources: string[]) =>
    sql ? (await sql`select 1 from source_pauses where source in ${sql(sources)} and until > now()`).length === sources.length : false;
  /** Pauses a paid search that refused us and tells the operator what answers meanwhile. */
  const unavailable = async (err: SourceUnavailableError, meanwhile: string) => {
    if (sql) await pauseSource(sql, err.source, err.reason);
    const dashboard = (SEARCH_DASHBOARDS as Record<string, string | undefined>)[err.source];
    await opts.alert?.send({
      key: `source-unavailable:${err.source}`,
      subject: `${err.source} is refusing searches`,
      text: [
        `${err.source} refused a request: ${err.reason}.`,
        '',
        `Web searches use ${meanwhile} for the next ${SOURCE_PAUSE_MS / 60_000} minutes, then try ${err.source} again, so it recovers by itself once the cause is fixed.`,
        dashboard ? `Fix it here: ${dashboard}` : '',
        `End the pause early on the VPS: nv sources resume ${err.source}`,
      ].join('\n'),
    });
  };
  const FREE = 'the free fallback (Mwmbl, fewer and weaker results)';
  const paid = paidSearchFromEnv(env, {
    fetch: fetchImpl,
    cache,
    sql,
    alert: opts.alert,
    paused: sql ? (name) => isPaused([name]) : undefined,
    onUnavailable: (err) => unavailable(err, chain.filter((n) => n !== err.source).join(' or ') || FREE),
    downMs: SOURCE_PAUSE_MS,
  });
  const mode: FreeSearchMode = env.FREE_SEARCH ?? freeSearchMode();
  // One client, so web, domains, local and icp searches share one rate limit and cache per provider.
  const brave = searchClient({
    brave: paid,
    free: freeClient({
      provider: mwmblProvider({ fetch: fetchImpl, intervalMs: env.FREE_SEARCH_INTERVAL_MS }),
      cache,
      onBlocked: sql ? (err) => pauseSource(sql, err.source, err.reason, new Date(), FREE_BLOCK_MS) : undefined,
    }),
    mode,
    // With two paid searches, the free one takes over only when both are paused.
    bravePaused: sql ? () => isPaused(chain) : undefined,
    onUnavailable: (err: SourceUnavailableError) => unavailable(err, FREE),
    braveDownMs: SOURCE_PAUSE_MS,
  });
  const web = webAdapter(brave);
  // Free routes from a company name to its website, tried before a paid lookup.
  const resolveName = nameResolver({ sql, crawl: opts.crawl, fetch: fetchImpl });
  const local = localAdapter({
    nominatimUrl: env.NOMINATIM_URL,
    overpassUrls: env.OVERPASS_URL,
    fetch: fetchImpl,
    // Overpass mirrors go down often: a web search fills in, when one is configured.
    webFallback: brave.configured ? web : undefined,
    // Places that list no website are looked up by name and city.
    placeLookup: brave.configured ? brave : undefined,
    resolveName,
  });
  return {
    local: local as SourceAdapter<unknown>,
    web: web as SourceAdapter<unknown>,
    domains: domainsAdapter(brave, { resolveName }) as SourceAdapter<unknown>,
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
