// Builds the crawl benchmark's fixed sample (apps/server/bench/crawl-sample.json)
// from the same sources searches use: OpenStreetMap for local, Show HN for
// launches and Brave for web. Without a Brave key the web slice comes from
// Wikidata (businesses with an official website in the countries nvoke
// sells to), which is free and stable. Built once and committed, so every
// benchmark run crawls the same sites.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pino } from 'pino';
import { domainOf, isPlatformDomain, isWebmailDomain, normalizeDomain, normalizeWebsite } from '@nvoke/shared/crawl';
import type { Env } from '../env.js';
import { fetchJson } from '../leads/http.js';
import { sleep } from '../leads/limits.js';
import { createAdapters } from '../leads/sources/index.js';
import { nicheTags, placeEmail, placesWithoutWebsiteQuery, queryOverpass, resolveArea } from '../leads/sources/local.js';
import type { FoundCompany, SourceAdapter } from '../leads/sources/types.js';
import type { SampleSite, SampleSource } from './crawl-bench.js';

const LOCAL_QUERIES: Array<[niche: string, location: string]> = [
  ['dentist', 'Aarhus'],
  ['accountant', 'Copenhagen'],
  ['lawyer', 'Odense'],
  ['architect', 'Hamburg'],
  ['hairdresser', 'Manchester'],
  ['physiotherapist', 'Amsterdam'],
  ['car repair', 'Stockholm'],
  ['electrician', 'Oslo'],
  ['restaurant', 'Austin'],
  ['estate agent', 'Dublin'],
  // Smaller areas, for when the public Overpass mirrors time out on the cities above.
  ['dentist', 'Odense'],
  ['restaurant', 'Aalborg'],
  ['hairdresser', 'Aarhus'],
  ['physiotherapist', 'Esbjerg'],
  ['car repair', 'Vejle'],
  ['cafe', 'Malmö'],
  ['bakery', 'Bergen'],
  ['optician', 'Utrecht'],
];

const WEB_KEYWORDS: Array<[keyword: string, country: string]> = [
  ['design studio', 'dk'],
  ['web agency', 'de'],
  ['accounting firm', 'gb'],
  ['saas startup', 'us'],
  ['law firm', 'se'],
  ['marketing agency', 'nl'],
];

/** Wikidata ids of the countries in the web slice, when it comes from Wikidata. */
const WIKIDATA_COUNTRIES: Array<[code: string, qid: string]> = [
  ['dk', 'Q35'],
  ['se', 'Q34'],
  ['no', 'Q20'],
  ['de', 'Q183'],
  ['nl', 'Q55'],
  ['gb', 'Q145'],
  ['us', 'Q30'],
];

const PER_SOURCE = 100;
/** Time spent on new local queries per run. The public Overpass mirrors are often down. */
const LOCAL_BUDGET_MS = 25 * 60_000;

interface WikidataResponse {
  results: { bindings: Array<{ itemLabel?: { value: string }; website?: { value: string } }> };
}

async function* wikidataBusinesses(country: string, qid: string): AsyncGenerator<FoundCompany> {
  const query = `
    SELECT ?item ?itemLabel ?website WHERE {
      VALUES ?type { wd:Q4830453 wd:Q6881511 wd:Q783794 }
      ?item wdt:P31 ?type; wdt:P17 wd:${qid}; wdt:P856 ?website.
      FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,da,sv,nb,de,nl". }
    } LIMIT 60`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetchJson<WikidataResponse>(url, { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
  for (const b of res.results.bindings) {
    if (b.website?.value) yield { name: b.itemLabel?.value ?? '', website: b.website.value, source: 'wikidata', location: country };
  }
}

/** Pauses before the second and third try of a query that failed (public Overpass mirrors time out). */
const QUERY_RETRY_DELAYS_MS = [30_000, 90_000];

/**
 * Builds the sample. Every query that finished is kept in `cacheDir`, so a
 * second run fetches only the queries that failed before.
 */
export async function buildSample(env: Env, cacheDir: string, log = pino({ level: 'warn' })): Promise<SampleSite[]> {
  const adapters = createAdapters(env);
  const seen = new Set<string>();
  const out: SampleSite[] = [];
  mkdirSync(cacheDir, { recursive: true });

  /** The companies a query found, from the cache or fetched (with retries) and cached. */
  const found = async (query: string, fetchAll: () => AsyncIterable<FoundCompany>, max: number): Promise<FoundCompany[] | null> => {
    const file = join(cacheDir, `${query.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as FoundCompany[] | null;
    for (let attempt = 0; attempt <= QUERY_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(QUERY_RETRY_DELAYS_MS[attempt - 1]!);
      const companies: FoundCompany[] = [];
      try {
        for await (const company of fetchAll()) {
          companies.push(company);
          if (companies.length >= max) break;
        }
        writeFileSync(file, JSON.stringify(companies, null, 1));
        return companies;
      } catch (err) {
        log.warn({ query, attempt, err: err instanceof Error ? err.message : String(err) }, 'sample: query failed');
      }
    }
    // Kept as failed too, so the next run does not spend another quarter hour on it.
    writeFileSync(file, 'null');
    return null;
  };

  const take = async (source: SampleSource, query: string, fetchAll: () => AsyncIterable<FoundCompany>, max: number) => {
    const companies = await found(query, fetchAll, max * 4);
    let n = 0;
    for (const company of companies ?? []) {
      const website = normalizeWebsite(company.website);
      const domain = website ? normalizeDomain(website) : null;
      if (!website || !domain || isPlatformDomain(domain) || seen.has(domain)) continue;
      seen.add(domain);
      out.push({ source, query, name: company.name, website, domain });
      if (++n >= max) break;
    }
    console.error(`${source.padEnd(8)} ${query}: ${companies ? n : 'failed'}`);
    return n;
  };
  const ctx = (limit: number) => ({ limit, signal: AbortSignal.timeout(10 * 60_000), log });

  // Launches and web first: they are quick, while Overpass can take a quarter hour per query.
  await take('launches', 'show hn, last 30 days', () => adapters.launches.find({ days: 30, sources: ['show_hn'] }, ctx(PER_SOURCE * 4)), PER_SOURCE);

  if (env.BRAVE_SEARCH_API_KEY) {
    const web = adapters.web as SourceAdapter<{ keyword: string; country: string }>;
    const perWeb = Math.ceil(PER_SOURCE / WEB_KEYWORDS.length);
    for (const [keyword, country] of WEB_KEYWORDS) {
      await take('web', `${keyword} (${country})`, () => web.find({ keyword, country }, ctx(perWeb * 4)), perWeb);
    }
  } else {
    const perCountry = Math.ceil(PER_SOURCE / WIKIDATA_COUNTRIES.length);
    for (const [code, qid] of WIKIDATA_COUNTRIES) {
      await take('web', `wikidata business (${code})`, () => wikidataBusinesses(code, qid), perCountry);
    }
  }

  // Ten places per query, until the local share is full or the time is up.
  let local = 0;
  const localDeadline = Date.now() + LOCAL_BUDGET_MS;
  for (const [niche, location] of LOCAL_QUERIES) {
    if (local >= PER_SOURCE || Date.now() > localDeadline) break;
    local += await take('local', `${niche} in ${location}`, () => adapters.local.find({ niche, location }, ctx(40)), Math.min(10, PER_SOURCE - local));
  }
  return out;
}

export interface FillRate {
  query: string;
  /** Places that match the niche by tag, with or without contact details. */
  places: number;
  website: number;
  /** An email tag on the business's own domain and no website. */
  ownEmailOnly: number;
  /** An email tag on webmail and no website. */
  webmailOnly: number;
}

/**
 * How many local places a search can use: the share of OSM places for each
 * sample query that have a website, and how many more have only an email.
 * Tag matches only, so the numbers compare across runs.
 */
export async function localFillRate(env: Env): Promise<FillRate[]> {
  const opts = { nominatimUrl: env.NOMINATIM_URL, overpassUrls: env.OVERPASS_URL };
  const out: FillRate[] = [];
  const deadline = Date.now() + LOCAL_BUDGET_MS;
  for (const [niche, location] of LOCAL_QUERIES) {
    if (Date.now() > deadline) break;
    const query = `${niche} in ${location}`;
    try {
      const area = await resolveArea(location, opts);
      if (!area) continue;
      const scope = area.areaId !== null ? '(area.a)' : `(${area.bbox.join(',')})`;
      const header = area.areaId !== null ? `area(id:${area.areaId})->.a;\n` : '';
      const ql = `[out:json][timeout:60];\n${header}(\n${nicheTags(niche).map((t) => `  nwr${t}${scope};`).join('\n')}\n);\nout tags;`;
      const res = await queryOverpass(opts, ql, AbortSignal.timeout(5 * 60_000));
      const row: FillRate = { query, places: 0, website: 0, ownEmailOnly: 0, webmailOnly: 0 };
      for (const el of res.elements ?? []) {
        const tags = el.tags ?? {};
        if (!tags.name) continue;
        row.places++;
        if (tags.website ?? tags['contact:website'] ?? tags.url) row.website++;
        else {
          const email = placeEmail(tags);
          if (email && isWebmailDomain(domainOf(email))) row.webmailOnly++;
          else if (email) row.ownEmailOnly++;
        }
      }
      out.push(row);
      console.error(`${query}: ${row.places} places, ${row.website} website, ${row.ownEmailOnly} own email only`);
    } catch (err) {
      console.error(`${query}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export interface PlaceSample {
  /** The local search, for example "dentist in Aarhus". */
  query: string;
  niche: string;
  location: string;
  /** ISO 3166-1 alpha-2, lowercase, from Nominatim. */
  country?: string;
  name: string;
  /** The place's addr:city, else the search location. */
  city: string;
  osmRef: string;
}

/** Places per query in the places sample. */
const PLACES_PER_QUERY = 10;

/**
 * The places benchmark's sample (apps/server/bench/place-sample.json): OSM
 * places that match a local sample query's niche by tag and have no website,
 * ten per query, picked by a hash of their id so a rebuild picks the same
 * ones. Every finished query is kept in `cacheDir`.
 */
export async function buildPlaceSample(env: Env, cacheDir: string): Promise<PlaceSample[]> {
  const opts = { nominatimUrl: env.NOMINATIM_URL, overpassUrls: env.OVERPASS_URL };
  mkdirSync(cacheDir, { recursive: true });
  const out: PlaceSample[] = [];
  const deadline = Date.now() + LOCAL_BUDGET_MS;
  for (const [niche, location] of LOCAL_QUERIES) {
    const query = `${niche} in ${location}`;
    const file = join(cacheDir, `${query.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
    let places: PlaceSample[] | null = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PlaceSample[]) : null;
    if (!places && Date.now() < deadline) {
      try {
        const area = await resolveArea(location, opts);
        if (!area) continue;
        const ql = placesWithoutWebsiteQuery(niche, area, 500);
        if (!ql) continue;
        const res = await queryOverpass(opts, ql, AbortSignal.timeout(5 * 60_000));
        const hash = (s: string) => createHash('sha1').update(s).digest('hex');
        places = (res.elements ?? [])
          .filter((el) => el.tags?.name)
          .map((el) => ({ el, key: hash(`${el.type}/${el.id}`) }))
          .sort((a, b) => a.key.localeCompare(b.key))
          .slice(0, PLACES_PER_QUERY)
          .map(({ el }) => ({
            query,
            niche,
            location,
            ...(area.countryCode ? { country: area.countryCode } : {}),
            name: el.tags!.name!,
            city: el.tags!['addr:city'] ?? location,
            osmRef: `${el.type}/${el.id}`,
          }));
        writeFileSync(file, JSON.stringify(places, null, 1));
      } catch (err) {
        console.error(`${query}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.error(`${query}: ${places ? places.length : 'failed'}`);
    out.push(...(places ?? []));
  }
  return out;
}
