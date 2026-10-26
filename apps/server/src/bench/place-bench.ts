// The places benchmark (docs/research/crawl-benchmark.md, "Local places
// without a website"): for each place in apps/server/bench/place-sample.json,
// the Brave lookup a local search makes ("<name> <city>"), the pick
// (`pickPlaceSite`) and a crawl of the picked site with the production crawler.
//
//   BRAVE_SEARCH_API_KEY=... pnpm --filter @nvoke/server cli bench places --label lookup
//
// Brave pages are kept in apps/server/.bench/brave, so a re-run (a changed
// pick rule) costs nothing, and the crawl reads the same HTTP cache as
// `bench crawl`.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pino } from 'pino';
import { normalizeDomain, normalizeWebsite, pickPlaceSite } from '@nvoke/shared/crawl';
import type { FetchLike } from '../leads/http.js';
import { nicheWords } from '../leads/sources/local.js';
import { braveClient, braveQuery } from '../leads/sources/web.js';
import type { CachedWebPage, WebSearchCache } from '../leads/web-cache.js';
import { runCrawlBench, type SiteResult } from './crawl-bench.js';
import type { PlaceSample } from './crawl-sample.js';

export interface PlaceResult {
  query: string;
  name: string;
  city: string;
  /** The first result domains Brave returned, for reading the picks. */
  results: string[];
  /** The domain picked as the place's own, or null. */
  picked: string | null;
  crawl: SiteResult | null;
}

/** Brave result pages kept on disk, one file per query, country and page. */
export function fileWebCache(dir: string): WebSearchCache {
  mkdirSync(dir, { recursive: true });
  const fileFor = (key: { q: string; country?: string; page: number }) =>
    join(dir, `${createHash('sha1').update(`${key.q.toLowerCase()}|${key.country ?? ''}|${key.page}`).digest('hex')}.json`);
  return {
    get: async (key) => {
      const file = fileFor(key);
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CachedWebPage) : null;
    },
    put: async (key, page) => writeFileSync(fileFor(key), JSON.stringify(page)),
  };
}

export async function runPlaceBench(
  sample: PlaceSample[],
  opts: { apiKey: string | undefined; braveDir: string; fetch?: FetchLike },
): Promise<{ places: PlaceResult[]; requests: number; cacheHits: number }> {
  // Without a key, a re-run reads the cached pages and Brave refuses any page it has not seen.
  const brave = braveClient({ apiKey: opts.apiKey ?? 'none', cache: fileWebCache(opts.braveDir), requestsPerSecond: 1 });
  const usage = { request: 0, cache_hit: 0 };
  const ctx = { limit: 1, signal: AbortSignal.timeout(60 * 60_000), log: pino({ level: 'warn' }), onUsage: (e: 'request' | 'own_request' | 'cache_hit') => void (e !== 'own_request' && usage[e]++) };
  const places: PlaceResult[] = [];
  for (const place of sample) {
    const { q, country } = braveQuery({ keyword: `${place.name} ${place.city}`, country: place.country });
    const page = await brave.page({ q, country, page: 0 }, ctx);
    const hit = pickPlaceSite(place.name, page.companies, [...nicheWords(place.niche), place.location, place.city]);
    const results = page.companies.map((c) => normalizeDomain(c.website) ?? c.website).slice(0, 6);
    places.push({ query: place.query, name: place.name, city: place.city, results, picked: hit ? normalizeDomain(hit.website) : null, crawl: null });
    console.error(`${hit ? 'hit ' : 'miss'} ${place.name} (${place.city}): ${hit ? normalizeDomain(hit.website) : results.slice(0, 3).join(', ')}`);
  }
  const toCrawl = places.flatMap((p, i) => {
    const hit = p.picked ? normalizeWebsite(`https://${p.picked}/`) : null;
    return hit ? [{ i, site: { source: 'local' as const, query: p.query, name: p.name, website: hit, domain: p.picked! } }] : [];
  });
  const crawled = await runCrawlBench(
    toCrawl.map((t) => t.site),
    { fetch: opts.fetch, onResult: (r, done) => console.error(`${String(done).padStart(4)}/${toCrawl.length} ${r.status.padEnd(8)} ${String(r.emails.length).padStart(2)} ${r.domain}`) },
  );
  toCrawl.forEach((t, n) => (places[t.i]!.crawl = crawled[n]!));
  return { places, requests: usage.request, cacheHits: usage.cache_hit };
}

/** One row per sample query and one for all: places, sites found, sites with an email. */
export function placeTable(label: string, places: PlaceResult[]): string {
  const queries = [...new Set(places.map((p) => p.query))];
  const row = (name: string, rows: PlaceResult[]) => {
    const found = rows.filter((p) => p.picked).length;
    const withEmail = rows.filter((p) => (p.crawl?.emails.length ?? 0) > 0).length;
    const pct = (n: number) => (rows.length ? `${((100 * n) / rows.length).toFixed(0)}%` : '0%');
    return `| ${name} | ${rows.length} | ${found} (${pct(found)}) | ${withEmail} (${pct(withEmail)}) |`;
  };
  return [
    `| ${label} | places | site found | with email |`,
    '|---|--:|--:|--:|',
    ...queries.map((q) => row(q, places.filter((p) => p.query === q))),
    row('all', places),
  ].join('\n');
}
