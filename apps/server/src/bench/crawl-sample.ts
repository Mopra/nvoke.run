// Builds the crawl benchmark's fixed sample (apps/server/bench/crawl-sample.json)
// from the same sources searches use: OpenStreetMap for local, Show HN for
// launches and Brave for web. Without a Brave key the web slice comes from
// Wikidata (businesses with an official website in the countries nvoke
// sells to), which is free and stable. Built once and committed, so every
// benchmark run crawls the same sites.

import { pino } from 'pino';
import { domainOf, isPlatformDomain, isWebmailDomain, normalizeDomain, normalizeWebsite } from '@nvoke/shared/crawl';
import type { Env } from '../env.js';
import { fetchJson } from '../leads/http.js';
import { createAdapters } from '../leads/sources/index.js';
import { elementToCompany, nicheTags, placeEmail, queryOverpass, resolveArea } from '../leads/sources/local.js';
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
    } ORDER BY MD5(STR(?item)) LIMIT 60`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetchJson<WikidataResponse>(url, { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
  for (const b of res.results.bindings) {
    if (b.website?.value) yield { name: b.itemLabel?.value ?? '', website: b.website.value, source: 'wikidata', location: country };
  }
}

export async function buildSample(env: Env, log = pino({ level: 'warn' })): Promise<SampleSite[]> {
  const adapters = createAdapters(env);
  const seen = new Set<string>();
  const out: SampleSite[] = [];

  const take = async (source: SampleSource, query: string, found: AsyncIterable<FoundCompany>, max: number) => {
    let n = 0;
    try {
      for await (const company of found) {
        const website = normalizeWebsite(company.website);
        const domain = website ? normalizeDomain(website) : null;
        if (!website || !domain || isPlatformDomain(domain) || seen.has(domain)) continue;
        seen.add(domain);
        out.push({ source, query, name: company.name, website, domain });
        if (++n >= max) break;
      }
    } catch (err) {
      log.warn({ query, err: err instanceof Error ? err.message : String(err) }, 'sample: query failed');
    }
    console.error(`${source.padEnd(8)} ${query}: ${n}`);
  };
  const ctx = (limit: number) => ({ limit, signal: AbortSignal.timeout(10 * 60_000), log });

  const perLocal = Math.ceil(PER_SOURCE / LOCAL_QUERIES.length);
  for (const [niche, location] of LOCAL_QUERIES) {
    await take('local', `${niche} in ${location}`, adapters.local.find({ niche, location }, ctx(perLocal * 3)), perLocal);
  }

  await take('launches', 'show hn, last 30 days', adapters.launches.find({ days: 30, sources: ['show_hn'] }, ctx(PER_SOURCE * 2)), PER_SOURCE);

  if (env.BRAVE_SEARCH_API_KEY) {
    const web = adapters.web as SourceAdapter<{ keyword: string; country: string }>;
    const perWeb = Math.ceil(PER_SOURCE / WEB_KEYWORDS.length);
    for (const [keyword, country] of WEB_KEYWORDS) {
      await take('web', `${keyword} (${country})`, web.find({ keyword, country }, ctx(perWeb * 2)), perWeb);
    }
  } else {
    const perCountry = Math.ceil(PER_SOURCE / WIKIDATA_COUNTRIES.length);
    for (const [code, qid] of WIKIDATA_COUNTRIES) {
      await take('web', `wikidata business (${code})`, wikidataBusinesses(code, qid), perCountry);
    }
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
  for (const [niche, location] of LOCAL_QUERIES) {
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
        if (elementToCompany(el)) row.website++;
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
