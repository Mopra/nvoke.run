// Local businesses from OpenStreetMap.
//
// 1. Nominatim resolves the location ("Copenhagen") to an OSM area or a
//    bounding box. Usage policy: an identifying User-Agent, at most one
//    request per second, and cache results. All three are done here.
//    https://operations.osmfoundation.org/policies/nominatim/
// 2. Overpass finds places in that area that match the niche by tag (a small
//    dictionary of common niches) or by name, and that have a website.
//    Requests are serialized, one at a time, per the Overpass etiquette.

import type { LocalSearchParams } from '@nvoke/shared';
import { BOT_USER_AGENT, HttpError, fetchJson, type FetchLike } from '../http.js';
import { KeyedMutex, RateLimiter } from '../limits.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';

export interface LocalAdapterOptions {
  nominatimUrl: string;
  /** Tried in order; the next one is used when one is busy or down. */
  overpassUrls: string[];
  fetch?: FetchLike;
}

export interface ResolvedArea {
  displayName: string;
  /** Overpass area id (relation id + 3600000000, way id + 2400000000) when the place is a polygon. */
  areaId: number | null;
  /** south, west, north, east */
  bbox: [number, number, number, number];
}

interface NominatimHit {
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  boundingbox?: [string, string, string, string];
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string;
}

/** A tag filter in Overpass syntax, for example `["amenity"="dentist"]`. */
type TagFilter = string;

/** Common niches, singular and plural, English and Danish. Anything else falls back to a name search. */
const NICHE_TAGS: Array<{ words: string[]; tags: TagFilter[] }> = [
  { words: ['dentist', 'dentists', 'dental', 'tandlæge', 'tandlaege', 'tandlæger', 'zahnarzt'], tags: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
  { words: ['doctor', 'doctors', 'clinic', 'clinics', 'læge', 'læger', 'gp'], tags: ['["amenity"="doctors"]', '["amenity"="clinic"]', '["healthcare"="doctor"]'] },
  { words: ['physiotherapist', 'physiotherapists', 'physio', 'fysioterapeut', 'fysioterapi'], tags: ['["healthcare"="physiotherapist"]'] },
  { words: ['chiropractor', 'chiropractors', 'kiropraktor'], tags: ['["healthcare"="chiropractor"]'] },
  { words: ['psychologist', 'psychologists', 'psykolog', 'therapist'], tags: ['["healthcare"="psychotherapist"]', '["healthcare"="psychologist"]'] },
  { words: ['veterinary', 'vet', 'vets', 'dyrlæge', 'dyrlæger'], tags: ['["amenity"="veterinary"]'] },
  { words: ['pharmacy', 'pharmacies', 'apotek'], tags: ['["amenity"="pharmacy"]'] },
  { words: ['optician', 'opticians', 'optiker'], tags: ['["shop"="optician"]'] },
  { words: ['lawyer', 'lawyers', 'law firm', 'attorney', 'advokat', 'advokater'], tags: ['["office"="lawyer"]'] },
  { words: ['accountant', 'accountants', 'accounting', 'revisor', 'revisorer', 'bookkeeper'], tags: ['["office"="accountant"]', '["office"="tax_advisor"]'] },
  { words: ['real estate', 'estate agent', 'realtor', 'realtors', 'ejendomsmægler', 'ejendomsmæglere'], tags: ['["office"="estate_agent"]'] },
  { words: ['insurance', 'forsikring'], tags: ['["office"="insurance"]'] },
  { words: ['architect', 'architects', 'arkitekt', 'arkitekter'], tags: ['["office"="architect"]'] },
  { words: ['consultant', 'consultants', 'consulting', 'konsulent'], tags: ['["office"="consulting"]'] },
  { words: ['it', 'software', 'it company', 'web agency', 'webbureau'], tags: ['["office"="it"]', '["office"="company"]["company"="software"]'] },
  { words: ['advertising', 'marketing agency', 'reklamebureau'], tags: ['["office"="advertising_agency"]'] },
  { words: ['restaurant', 'restaurants', 'restauranter'], tags: ['["amenity"="restaurant"]'] },
  { words: ['cafe', 'cafes', 'café', 'caféer', 'coffee'], tags: ['["amenity"="cafe"]'] },
  { words: ['bar', 'bars', 'pub', 'pubs', 'værtshus'], tags: ['["amenity"="bar"]', '["amenity"="pub"]'] },
  { words: ['hotel', 'hotels', 'hoteller'], tags: ['["tourism"="hotel"]', '["tourism"="guest_house"]'] },
  { words: ['bakery', 'bakeries', 'bager', 'bagere'], tags: ['["shop"="bakery"]'] },
  { words: ['florist', 'florists', 'blomsterhandler'], tags: ['["shop"="florist"]'] },
  { words: ['hairdresser', 'hairdressers', 'barber', 'barbers', 'salon', 'frisør', 'frisører'], tags: ['["shop"="hairdresser"]'] },
  { words: ['beauty', 'beauty salon', 'spa', 'kosmetolog', 'skønhedsklinik'], tags: ['["shop"="beauty"]', '["leisure"="spa"]'] },
  { words: ['gym', 'gyms', 'fitness', 'fitnesscenter'], tags: ['["leisure"="fitness_centre"]'] },
  { words: ['yoga'], tags: ['["leisure"="fitness_centre"]["sport"="yoga"]', '["sport"="yoga"]'] },
  { words: ['car repair', 'mechanic', 'mechanics', 'garage', 'autoværksted', 'mekaniker'], tags: ['["shop"="car_repair"]'] },
  { words: ['car dealer', 'car dealers', 'bilforhandler'], tags: ['["shop"="car"]'] },
  { words: ['bicycle', 'bike shop', 'cykelhandler', 'cykelsmed'], tags: ['["shop"="bicycle"]'] },
  { words: ['plumber', 'plumbers', 'vvs', 'blikkenslager'], tags: ['["craft"="plumber"]'] },
  { words: ['electrician', 'electricians', 'elektriker', 'elektrikere'], tags: ['["craft"="electrician"]'] },
  { words: ['carpenter', 'carpenters', 'tømrer', 'tømrere', 'snedker'], tags: ['["craft"="carpenter"]', '["craft"="joiner"]'] },
  { words: ['painter', 'painters', 'maler', 'malere'], tags: ['["craft"="painter"]'] },
  { words: ['roofer', 'roofers', 'tagdækker'], tags: ['["craft"="roofer"]'] },
  { words: ['locksmith', 'locksmiths', 'låsesmed'], tags: ['["craft"="locksmith"]', '["shop"="locksmith"]'] },
  { words: ['photographer', 'photographers', 'fotograf', 'fotografer'], tags: ['["craft"="photographer"]', '["shop"="photo"]'] },
  { words: ['gardener', 'gardeners', 'landscaper', 'anlægsgartner'], tags: ['["craft"="gardener"]'] },
  { words: ['cleaning', 'cleaners', 'rengøring'], tags: ['["craft"="cleaning"]', '["shop"="dry_cleaning"]'] },
  { words: ['jeweller', 'jewelers', 'jewellery', 'guldsmed'], tags: ['["shop"="jewelry"]'] },
  { words: ['clothes', 'clothing', 'fashion', 'tøjbutik'], tags: ['["shop"="clothes"]'] },
  { words: ['furniture', 'møbler', 'møbelbutik'], tags: ['["shop"="furniture"]'] },
  { words: ['bookshop', 'bookstore', 'boghandel'], tags: ['["shop"="books"]'] },
  { words: ['school', 'schools', 'skole', 'driving school', 'køreskole'], tags: ['["amenity"="driving_school"]', '["amenity"="language_school"]'] },
  { words: ['kindergarten', 'daycare', 'børnehave', 'vuggestue'], tags: ['["amenity"="kindergarten"]', '["amenity"="childcare"]'] },
  { words: ['coworking', 'co-working'], tags: ['["amenity"="coworking_space"]', '["office"="coworking"]'] },
  { words: ['travel agency', 'rejsebureau'], tags: ['["shop"="travel_agency"]'] },
];

/** OSM tag filters for a niche, or an empty list when only a name search makes sense. */
export function nicheTags(niche: string): TagFilter[] {
  const n = niche.trim().toLowerCase();
  for (const entry of NICHE_TAGS) if (entry.words.includes(n)) return entry.tags;
  return [];
}

/** Escapes a value for an Overpass regex inside a double quoted string. */
function overpassRegex(text: string): string {
  return text
    .trim()
    .replace(/[\\.*+?^${}()|[\]]/g, '\\$&')
    .replace(/"/g, '\\"');
}

/** The name pattern for a niche: the word without a trailing plural "s". */
function nameStem(niche: string): string {
  const n = niche.trim();
  return n.length > 4 && /s$/i.test(n) && !/ss$/i.test(n) ? n.slice(0, -1) : n;
}

export function buildOverpassQuery(niche: string, area: ResolvedArea, max: number): string {
  const scope = area.areaId !== null ? '(area.a)' : `(${area.bbox.join(',')})`;
  const header = area.areaId !== null ? `area(id:${area.areaId})->.a;\n` : '';
  const filters = [...nicheTags(niche), `["name"~"${overpassRegex(nameStem(niche))}",i]`];
  const lines: string[] = [];
  // The website filter goes first: it is selective, so the name regex only
  // runs on places that have a website at all. With the regex first, a city
  // sized query can run past the server's time limit.
  for (const f of filters) {
    lines.push(`  nwr["website"]${f}${scope};`);
    lines.push(`  nwr["contact:website"]${f}${scope};`);
  }
  return `[out:json][timeout:60];\n${header}(\n${lines.join('\n')}\n);\nout tags ${Math.max(1, max)};`;
}

function addressOf(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  const out = [street, city].filter(Boolean).join(', ');
  return out || undefined;
}

const CATEGORY_KEYS = ['amenity', 'shop', 'office', 'craft', 'healthcare', 'tourism', 'leisure'];

export function elementToCompany(el: OverpassElement): FoundCompany | null {
  const tags = el.tags ?? {};
  const name = (tags.name ?? tags.brand ?? tags.operator ?? '').trim();
  const website = (tags.website ?? tags['contact:website'] ?? tags.url ?? '').split(';')[0]?.trim() ?? '';
  if (!name || !website) return null;
  const categoryKey = CATEGORY_KEYS.find((k) => tags[k]);
  const phone = (tags.phone ?? tags['contact:phone'] ?? '').split(';')[0]?.trim();
  return {
    name,
    website,
    source: 'osm',
    sourceRef: `${el.type}/${el.id}`,
    location: addressOf(tags),
    phone: phone || undefined,
    category: categoryKey ? `${categoryKey}=${tags[categoryKey]}` : undefined,
  };
}

// One Nominatim request per second for the whole process, and one Overpass query at a time.
const nominatimLimiter = new RateLimiter(1_100);
const overpassLock = new KeyedMutex();
const areaCache = new Map<string, Promise<ResolvedArea | null>>();

export async function resolveArea(
  location: string,
  opts: LocalAdapterOptions,
  signal?: AbortSignal,
): Promise<ResolvedArea | null> {
  const key = location.trim().toLowerCase();
  const hit = areaCache.get(key);
  if (hit) return hit;
  const pending = (async () => {
    await nominatimLimiter.wait('nominatim', signal);
    const url = new URL('/search', opts.nominatimUrl);
    url.searchParams.set('q', location);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    const hits = await fetchJson<NominatimHit[]>(url.toString(), {
      fetch: opts.fetch,
      signal,
      timeoutMs: 20_000,
      headers: { 'user-agent': BOT_USER_AGENT, 'accept-language': 'en' },
    });
    const top = hits[0];
    if (!top?.boundingbox) return null;
    const [south, north, west, east] = top.boundingbox.map(Number) as [number, number, number, number];
    if (![south, north, west, east].every(Number.isFinite)) return null;
    let areaId: number | null = null;
    if (top.osm_type === 'relation' && top.osm_id) areaId = 3_600_000_000 + top.osm_id;
    else if (top.osm_type === 'way' && top.osm_id) areaId = 2_400_000_000 + top.osm_id;
    const area: ResolvedArea = { displayName: top.display_name ?? location, areaId, bbox: [south, west, north, east] };
    return area;
  })();
  areaCache.set(key, pending);
  pending.catch(() => areaCache.delete(key));
  if (areaCache.size > 1_000) {
    const oldest = areaCache.keys().next().value;
    if (oldest !== undefined) areaCache.delete(oldest);
  }
  return pending;
}

/** Runs a query against the first Overpass instance that is not busy. */
export async function queryOverpass(opts: LocalAdapterOptions, query: string, signal: AbortSignal): Promise<OverpassResponse> {
  const errors: string[] = [];
  for (const url of opts.overpassUrls) {
    try {
      return await fetchJson<OverpassResponse>(url, {
        fetch: opts.fetch,
        method: 'POST',
        // A plain string body and "Accept: */*" on purpose: overpass-api.de
        // answers 504 to the same query sent with "Accept: application/json"
        // or with a "charset" parameter on the form content type.
        body: new URLSearchParams({ data: query }).toString(),
        signal,
        timeoutMs: 90_000,
        maxBytes: 20_000_000,
        headers: { 'user-agent': BOT_USER_AGENT, 'content-type': 'application/x-www-form-urlencoded', accept: '*/*' },
      });
    } catch (err) {
      if (signal.aborted) throw err;
      // Busy (429), overloaded (5xx), slow or unreachable: try the next instance.
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      errors.push(`${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`overpass unavailable (${errors.join('; ') || 'no OVERPASS_URL configured'})`);
}

export function localAdapter(opts: LocalAdapterOptions): SourceAdapter<LocalSearchParams> {
  return {
    kind: 'local',
    async *find(params, ctx) {
      const area = await resolveArea(params.location, opts, ctx.signal);
      if (!area) throw new PermanentError(`location not found: ${params.location}`, 'location_not_found');
      ctx.log.info({ area: area.displayName, areaId: area.areaId }, 'local: resolved location');

      // Ask for more than the limit: some websites are platforms or duplicates and get dropped.
      const query = buildOverpassQuery(params.niche, area, Math.min(1_000, ctx.limit * 3 + 20));
      const res = await overpassLock.run('overpass', () => queryOverpass(opts, query, ctx.signal));
      if (res.remark && /runtime error|timed out|out of memory/i.test(res.remark)) {
        throw new Error(`overpass: ${res.remark}`);
      }
      for (const el of res.elements ?? []) {
        const company = elementToCompany(el);
        if (company) yield company;
      }
    },
  };
}
