import { describe, expect, it } from 'vitest';
import { fakeFetch, fixture, silentLog } from '../../testing/fakes.js';
import type { NameQuery, NameResolver } from './resolve-name.js';
import type { FoundCompany, SourceAdapter } from './types.js';
import { buildOverpassQuery, elementToCompany, localAdapter, nicheTags, placesWithoutWebsiteQuery, type ResolvedArea } from './local.js';
import { braveClient, braveQuery, braveRetryAfter, nameFromTitle, resultToCompany, webAdapter, BRAVE_ENDPOINT } from './web.js';
import { ALGOLIA_SEARCH, PRODUCT_HUNT_GRAPHQL, hitToCompany, launchesAdapter, parseShowHnTitle, phMatches } from './launches.js';
import { PermanentError, SourceUnavailableError } from './types.js';
import type { CachedWebPage, WebPageKey, WebSearchCache } from '../web-cache.js';
import type { WebSearchParams } from '@nvoke/shared';

async function collect<P>(adapter: SourceAdapter<P>, params: P, limit = 50): Promise<FoundCompany[]> {
  const out: FoundCompany[] = [];
  const signal = new AbortController().signal;
  for await (const c of adapter.find(params, { limit, signal, log: silentLog })) out.push(c);
  return out;
}

describe('local adapter (Nominatim + Overpass)', () => {
  const nominatim = 'https://nominatim.test';
  const overpass = 'https://overpass.test/api/interpreter';

  it('maps niches to OSM tags in English and Danish', () => {
    expect(nicheTags('Dentists')).toContain('["amenity"="dentist"]');
    expect(nicheTags('tandlæge')).toContain('["amenity"="dentist"]');
    expect(nicheTags('plumber')).toEqual(['["craft"="plumber"]']);
    expect(nicheTags('quantum widgets')).toEqual([]);
  });

  it('builds an area query for polygons and a bbox query for points', () => {
    const area: ResolvedArea = { displayName: 'X', areaId: 3600012345, bbox: [1, 2, 3, 4] };
    const q = buildOverpassQuery('dentists', area, 30);
    expect(q).toContain('area(id:3600012345)->.a;');
    expect(q).toContain('nwr["website"]["amenity"="dentist"](area.a);');
    expect(q).toContain('["name"~"dentist",i]');
    expect(q).toContain('out tags 30;');
    const b = buildOverpassQuery('web "agency"', { ...area, areaId: null }, 5);
    expect(b).toContain('(1,2,3,4)');
    expect(b).toContain('\\"agency\\"');
  });

  it('turns OSM elements into companies and skips ones without a website', () => {
    expect(
      elementToCompany({
        type: 'node',
        id: 1,
        tags: {
          name: 'Smile',
          'contact:website': 'https://smile.dk;https://other.dk',
          'contact:phone': '+45 1234',
          'addr:street': 'Vej',
          'addr:housenumber': '2',
          'addr:postcode': '2100',
          'addr:city': 'København',
          amenity: 'dentist',
        },
      }),
    ).toEqual({
      name: 'Smile',
      website: 'https://smile.dk',
      source: 'osm',
      sourceRef: 'node/1',
      location: 'Vej 2, 2100 København',
      phone: '+45 1234',
      category: 'amenity=dentist',
    });
    expect(elementToCompany({ type: 'way', id: 2, tags: { name: 'No site' } })).toBeNull();
  });

  it('finds dentists in Copenhagen from recorded responses', async () => {
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json'), headers: { 'content-type': 'application/json' } },
      [overpass]: { body: fixture('sources/overpass-dentists-copenhagen.json'), headers: { 'content-type': 'application/json' } },
    });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch });
    const found = await collect(adapter, { niche: 'dentists', location: 'Copenhagen (fixture)' });
    expect(found.length).toBeGreaterThan(5);
    expect(found.every((c) => c.source === 'osm' && c.website && c.name)).toBe(true);
    expect(found.map((c) => c.name)).toContain('Amager Tandklinik');

    const nominatimCall = fetch.calls.find((c) => c.url.startsWith(nominatim))!;
    expect(nominatimCall.headers['user-agent']).toMatch(/^nvokebot\/1\.0/);
    expect(new URL(nominatimCall.url).searchParams.get('format')).toBe('jsonv2');
    const overpassCall = fetch.calls.find((c) => c.url === overpass)!;
    expect(overpassCall.method).toBe('POST');
    expect(decodeURIComponent(overpassCall.body ?? '')).toContain('"amenity"="dentist"');
  });

  it('falls back to the next Overpass instance when one is busy', async () => {
    const busy = 'https://busy.test/api/interpreter';
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json') },
      [busy]: { status: 504, body: 'timeout' },
      [overpass]: { body: fixture('sources/overpass-dentists-copenhagen.json') },
    });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [busy, overpass], fetch });
    const found = await collect(adapter, { niche: 'dentists', location: 'Copenhagen (fallback)' });
    expect(found.length).toBeGreaterThan(0);
  });

  it('fails permanently for a location Nominatim does not know', async () => {
    const fetch = fakeFetch({ [`${nominatim}/search`]: { body: '[]' } });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch });
    await expect(collect(adapter, { niche: 'dentists', location: 'Nowhere at all' })).rejects.toBeInstanceOf(PermanentError);
  });

  /** A web search that records what it was asked and yields one company per call. */
  function fakeWeb() {
    const asked: WebSearchParams[] = [];
    const adapter: SourceAdapter<WebSearchParams> = {
      kind: 'web',
      async *find(params) {
        asked.push(params);
        yield { name: 'Web Dental', website: 'https://webdental.example', source: 'brave' };
      },
    };
    return { adapter, asked };
  }
  const austin = JSON.stringify([
    { osm_type: 'relation', osm_id: 113314, display_name: 'Austin, Texas', boundingbox: ['30', '30.5', '-98', '-97.5'], address: { country_code: 'US' } },
  ]);

  it('goes round the instances again after a pause when all of them fail', async () => {
    const second = 'https://second.test/api/interpreter';
    let firstCalls = 0;
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json') },
      [overpass]: () => (++firstCalls === 1 ? { status: 502, body: 'bad gateway' } : { body: fixture('sources/overpass-dentists-copenhagen.json') }),
      [second]: { status: 200, body: JSON.stringify({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 61 seconds.' }) },
    });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass, second], overpassRetryDelaysMs: [0], fetch });
    const found = await collect(adapter, { niche: 'dentists', location: 'Copenhagen (second round)' });
    expect(found.length).toBeGreaterThan(5);
    expect(fetch.calls.filter((c) => c.url === second)).toHaveLength(1);
    expect(firstCalls).toBe(2);
  });

  it('fails at once on a 400, which is our query and not a busy server', async () => {
    const second = 'https://second.test/api/interpreter';
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json') },
      [overpass]: { status: 400, body: 'parse error' },
      [second]: { body: fixture('sources/overpass-dentists-copenhagen.json') },
    });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass, second], overpassRetryDelaysMs: [0], fetch });
    await expect(collect(adapter, { niche: 'dentists', location: 'Copenhagen (400)' })).rejects.toThrow(/400/);
    expect(fetch.calls.some((c) => c.url === second)).toBe(false);
  });

  it('falls back to a web search for "<niche> in <location>" when every instance stays down', async () => {
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: austin },
      [overpass]: { status: 504, body: 'timeout' },
    });
    const web = fakeWeb();
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], overpassRetryDelaysMs: [0, 0], fetch, webFallback: web.adapter });
    const found = await collect(adapter, { niche: 'dentists', location: 'Austin, Texas' });
    expect(found.map((c) => c.name)).toEqual(['Web Dental']);
    expect(web.asked).toEqual([{ keyword: 'dentists in Austin, Texas', country: 'us' }]);
    expect(fetch.calls.filter((c) => c.url === overpass)).toHaveLength(3);
  });

  it('throws when every instance stays down and there is no web search', async () => {
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json') },
      [overpass]: { status: 502, body: 'bad gateway' },
    });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], overpassRetryDelaysMs: [0], fetch });
    await expect(collect(adapter, { niche: 'dentists', location: 'Copenhagen (down)' })).rejects.toThrow(/overpass unavailable/);
  });

  it('keeps an unknown location a permanent error even with a web search', async () => {
    const fetch = fakeFetch({ [`${nominatim}/search`]: { body: '[]' } });
    const web = fakeWeb();
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, webFallback: web.adapter });
    await expect(collect(adapter, { niche: 'dentists', location: 'Nowhere at all (web)' })).rejects.toBeInstanceOf(PermanentError);
    expect(web.asked).toEqual([]);
  });

  it('asks for named places without a website by tag only', () => {
    const area: ResolvedArea = { displayName: 'X', areaId: 3600012345, bbox: [1, 2, 3, 4] };
    expect(placesWithoutWebsiteQuery('dentists', area, 40)).toContain(
      'nwr["amenity"="dentist"]["name"][!"website"][!"contact:website"][!"url"](area.a);',
    );
    expect(placesWithoutWebsiteQuery('quantum widgets', area, 40)).toBeNull();
  });

  it('looks up places without a website by name and city, and keeps only their own sites', async () => {
    const place = (id: number, name: string, extra: Record<string, string> = {}) => ({ type: 'node', id, tags: { name, amenity: 'dentist', ...extra } });
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: austin },
      [overpass]: (_url, init) =>
        new URLSearchParams(String(init?.body)).get('data')?.includes('[!"website"]')
          ? {
              body: JSON.stringify({
                elements: [
                  place(2, 'Tandlæge Jensen', { 'addr:city': 'Round Rock' }),
                  place(3, 'Tandlæge Jensen'),
                  place(4, 'Smile'),
                  place(5, 'Ghost Dental'),
                  place(6, 'Bright Teeth'),
                ],
              }),
            }
          : { body: JSON.stringify({ elements: [place(1, 'Smile', { website: 'https://smile.example' })] }) },
      [BRAVE_ENDPOINT]: (url) => {
        const urls: Record<string, string[]> = {
          'Tandlæge Jensen Round Rock': ['https://www.yelp.com/biz/jensen', 'https://www.tandlaege-jensen.com/kontakt'],
          'Ghost Dental Austin, Texas': ['https://www.facebook.com/ghost', 'https://dentistdirectory.example/ghost-dental'],
          'Bright Teeth Austin, Texas': ['https://brightteeth.example/'],
        };
        return { body: JSON.stringify({ web: { results: (urls[url.searchParams.get('q') ?? ''] ?? []).map((u) => ({ url: u, title: u })) } }) };
      },
    });
    const brave = braveClient({ apiKey: 'k', fetch, requestsPerSecond: 1_000 });
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, placeLookup: brave, maxPlaceLookups: 2 });
    const found = await collect(adapter, { niche: 'dentists', location: 'Austin, Texas' });
    expect(found.map((c) => [c.name, c.website, c.sourceRef])).toEqual([
      ['Smile', 'https://smile.example', 'node/1'],
      ['Tandlæge Jensen', 'https://www.tandlaege-jensen.com', 'node/2'],
    ]);
    const asked = fetch.calls.filter((c) => c.url.startsWith(BRAVE_ENDPOINT)).map((c) => new URL(c.url));
    // The repeat and the name already found are skipped, and the cap of 2 leaves Bright Teeth out.
    expect(asked.map((u) => u.searchParams.get('q'))).toEqual(['Tandlæge Jensen Round Rock', 'Ghost Dental Austin, Texas']);
    expect(asked[0]!.searchParams.get('country')).toBe('us');
  });

  it('tries the free routes before Brave for places without a website, and needs no Brave for them', async () => {
    const place = (id: number, name: string, extra: Record<string, string> = {}) => ({ type: 'node', id, tags: { name, amenity: 'dentist', ...extra } });
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: austin },
      [overpass]: (_url, init) =>
        new URLSearchParams(String(init?.body)).get('data')?.includes('[!"website"]')
          ? { body: JSON.stringify({ elements: [place(2, 'Jensen Dental', { 'addr:city': 'Round Rock' }), place(3, 'Bright Teeth'), place(4, 'Ghost Dental')] }) }
          : { body: JSON.stringify({ elements: [] }) },
      [BRAVE_ENDPOINT]: (url) => ({
        body: JSON.stringify({ web: { results: url.searchParams.get('q') === 'Bright Teeth Austin, Texas (free)' ? [{ url: 'https://brightteeth.example/', title: 'Bright Teeth' }] : [] } }),
      }),
    });
    const asked: NameQuery[] = [];
    const resolveName: NameResolver = {
      resolve: async (q) => (asked.push(q), q.name === 'Jensen Dental' ? { domain: 'jensendental.com', website: 'https://jensendental.com/', route: 'known' } : null),
    };
    const brave = braveClient({ apiKey: 'k', fetch, requestsPerSecond: 1_000 });
    const withBrave = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, placeLookup: brave, resolveName });
    const found = await collect(withBrave, { niche: 'dentists', location: 'Austin, Texas (free)' });
    expect(found.map((c) => [c.name, c.website, c.source, c.sourceRef])).toEqual([
      ['Jensen Dental', 'https://jensendental.com/', 'osm', 'node/2'],
      ['Bright Teeth', 'https://brightteeth.example', 'osm', 'node/3'],
    ]);
    expect(asked[0]).toMatchObject({ name: 'Jensen Dental', country: 'us', city: 'Round Rock' });
    expect(asked[0]!.generic).toEqual(expect.arrayContaining(['dentist', 'Round Rock']));
    const braveAsked = fetch.calls.filter((c) => c.url.startsWith(BRAVE_ENDPOINT)).map((c) => new URL(c.url).searchParams.get('q'));
    expect(braveAsked).toEqual(['Bright Teeth Austin, Texas (free)', 'Ghost Dental Austin, Texas (free)']);

    // Without Brave, and with no Brave lookups left, the free routes still run.
    const freeOnly = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, resolveName, maxPlaceLookups: 0 });
    const free = await collect(freeOnly, { niche: 'dentists', location: 'Austin, Texas (free only)' });
    expect(free.map((c) => c.website)).toEqual(['https://jensendental.com/']);
  });

  it('tops up from the web search only after OpenStreetMap ran out', async () => {
    const fetch = fakeFetch({
      [`${nominatim}/search`]: { body: fixture('sources/nominatim-copenhagen.json') },
      [overpass]: { body: fixture('sources/overpass-dentists-copenhagen.json') },
    });
    const web = fakeWeb();
    const adapter = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, webFallback: web.adapter });
    const all = await collect(adapter, { niche: 'dentists', location: 'Copenhagen (top up)' }, 1_000);
    expect(all.at(-1)?.name).toBe('Web Dental');
    expect(all.slice(0, -1).every((c) => c.source === 'osm')).toBe(true);
    expect(web.asked).toEqual([{ keyword: 'dentists in Copenhagen (top up)' }]);

    // A caller that stops at its limit never reaches the web search.
    const web2 = fakeWeb();
    const enough = localAdapter({ nominatimUrl: nominatim, overpassUrls: [overpass], fetch, webFallback: web2.adapter });
    const it = enough.find({ niche: 'dentists', location: 'Copenhagen (enough)' }, { limit: 3, signal: new AbortController().signal, log: silentLog });
    let n = 0;
    for await (const _ of it) if (++n >= 3) break;
    expect(web2.asked).toEqual([]);
  });
});

describe('web adapter (Brave Search)', () => {
  it('fails with a clear permanent error when the API key is missing', async () => {
    const adapter = webAdapter({ apiKey: undefined, fetch: fakeFetch({}) });
    await expect(collect(adapter, { keyword: 'x' })).rejects.toThrow(/BRAVE_SEARCH_API_KEY/);
    await expect(collect(adapter, { keyword: 'x' })).rejects.toBeInstanceOf(PermanentError);
  });

  it('reads results from a recorded response, with the key in the header', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { body: fixture('sources/brave-web-search.json') } });
    const adapter = webAdapter({ apiKey: 'test-key', fetch });
    const found = await collect(adapter, { keyword: 'industrial design studio copenhagen', country: 'dk' });
    expect(found.map((c) => c.website)).toEqual([
      'https://www.kibisi-studio.dk',
      'https://en.wikipedia.org',
      'https://formlab.example-design.dk',
      'https://www.linkedin.com',
      'https://nordicshape.dk',
      'https://kibisi-studio.dk',
    ]);
    expect(found[0]?.name).toBe('Kibisi Studio');
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]?.headers['x-subscription-token']).toBe('test-key');
    const url = new URL(fetch.calls[0]!.url);
    expect(url.searchParams.get('q')).toBe('industrial design studio copenhagen');
    expect(url.searchParams.get('country')).toBe('dk');
  });

  it('fetches the next page only when the caller keeps reading', async () => {
    const fetch = fakeFetch({
      [BRAVE_ENDPOINT]: (url) => {
        const n = Number(url.searchParams.get('offset'));
        const results = Array.from({ length: 20 }, (_, i) => ({ url: `https://p${n}-${i}.dk/`, title: `P${n} ${i}` }));
        return { body: JSON.stringify({ web: { results }, query: { more_results_available: n < 1 } }) };
      },
    });
    const adapter = webAdapter({ apiKey: 'k', fetch, requestsPerSecond: 1_000 });
    const out: string[] = [];
    for await (const c of adapter.find({ keyword: 'dentists' }, { limit: 5, signal: new AbortController().signal, log: silentLog })) {
      out.push(c.website);
      if (out.length === 5) break;
    }
    expect(fetch.calls).toHaveLength(1);
    expect(await collect(adapter, { keyword: 'dentists' })).toHaveLength(40);
    expect(fetch.calls).toHaveLength(3);
  });

  it('serves pages from the cache and reports paid requests and cache hits', async () => {
    const store = new Map<string, CachedWebPage>();
    const k = (key: WebPageKey) => `${key.q}|${key.country ?? ''}|${key.page}`;
    const cache: WebSearchCache = {
      get: async (key) => store.get(k(key)) ?? null,
      put: async (key, page) => void store.set(k(key), page),
    };
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { body: fixture('sources/brave-web-search.json') } });
    const adapter = webAdapter({ apiKey: 'k', fetch, cache, requestsPerSecond: 1_000 });
    const events: string[] = [];
    const run = async () => {
      const out: string[] = [];
      const ctx = { limit: 50, signal: new AbortController().signal, log: silentLog, onUsage: (e: string) => void events.push(e) };
      for await (const c of adapter.find({ keyword: 'design studio', country: 'dk' }, ctx)) out.push(c.website);
      return out;
    };
    const first = await run();
    const calls = fetch.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(events.every((e) => e === 'request')).toBe(true);
    events.length = 0;
    expect(await run()).toEqual(first);
    expect(fetch.calls).toHaveLength(calls);
    expect(events.length).toBe(calls);
    expect(events.every((e) => e === 'cache_hit')).toBe(true);
  });

  it('still searches when the cache fails', async () => {
    const cache: WebSearchCache = {
      get: () => Promise.reject(new Error('db down')),
      put: () => Promise.reject(new Error('db down')),
    };
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { body: fixture('sources/brave-web-search.json') } });
    const found = await collect(webAdapter({ apiKey: 'k', fetch, cache, requestsPerSecond: 1_000 }), { keyword: 'x' });
    expect(found.length).toBeGreaterThan(0);
  });

  it('reads how long a 429 wants us to wait from the rate limit headers', () => {
    const h = (limit: string, remaining: string, reset: string) =>
      new Headers({ 'x-ratelimit-limit': limit, 'x-ratelimit-remaining': remaining, 'x-ratelimit-reset': reset });
    // Per second window spent, the monthly window unlimited (limit 0).
    expect(braveRetryAfter(h('50, 0', '0, 0', '1, 1574023'))).toBe(1);
    // A monthly quota spent for weeks is not worth waiting for.
    expect(braveRetryAfter(h('50, 2000', '12, 0', '1, 1574023'))).toBeNull();
    expect(braveRetryAfter(undefined)).toBe(1);
  });

  it('turns a spend limit or a refused key into SourceUnavailableError, and waits out a short rate limit', async () => {
    const limited = fakeFetch({
      [BRAVE_ENDPOINT]: { status: 429, body: '{"error":"usage limit"}', headers: { 'x-ratelimit-limit': '50, 2000', 'x-ratelimit-remaining': '3, 0', 'x-ratelimit-reset': '1, 900000' } },
    });
    await expect(collect(webAdapter({ apiKey: 'k', fetch: limited, requestsPerSecond: 1_000 }), { keyword: 'x' })).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(limited.calls).toHaveLength(1);

    const refused = fakeFetch({ [BRAVE_ENDPOINT]: { status: 402, body: 'payment required' } });
    const err = await collect(webAdapter({ apiKey: 'k', fetch: refused, requestsPerSecond: 1_000 }), { keyword: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceUnavailableError);
    expect((err as SourceUnavailableError).code).toBe('source_unavailable');

    let n = 0;
    const burst = fakeFetch({
      [BRAVE_ENDPOINT]: () =>
        ++n === 1
          ? { status: 429, body: '', headers: { 'x-ratelimit-limit': '50, 0', 'x-ratelimit-remaining': '0, 0', 'x-ratelimit-reset': '1, 900000' } }
          : { body: fixture('sources/brave-web-search.json') },
    });
    const found = await collect(webAdapter({ apiKey: 'k', fetch: burst, requestsPerSecond: 1_000 }), { keyword: 'x' });
    expect(found.length).toBeGreaterThan(0);
  });

  it('scopes to countries Brave supports and names the others in the query', () => {
    expect(braveQuery({ keyword: 'headless cms' })).toEqual({ q: 'headless cms' });
    expect(braveQuery({ keyword: 'headless cms', country: 'de' })).toEqual({ q: 'headless cms', country: 'de' });
    expect(braveQuery({ keyword: 'headless cms', country: 'ie' })).toEqual({ q: 'headless cms Ireland' });
    expect(braveQuery({ keyword: 'headless cms', country: 'is' })).toEqual({ q: 'headless cms Iceland' });
  });

  it('derives a name from the title or the domain', () => {
    expect(nameFromTitle('Acme Dental | Best dentist', 'acme.dk')).toBe('Acme Dental');
    expect(nameFromTitle('Form Lab ApS - Product design', 'formlab.dk')).toBe('Form Lab ApS');
    expect(nameFromTitle(undefined, 'formlab.dk')).toBe('Formlab');
    expect(resultToCompany({ url: 'not a url' })).toBeNull();
  });
});

describe('launches adapter (Show HN + Product Hunt)', () => {
  const now = () => new Date('2026-10-13T12:00:00Z');

  it('parses Show HN titles', () => {
    expect(parseShowHnTitle('Show HN: Meterbase \u2013 Usage-based billing')).toEqual({
      name: 'Meterbase',
      tagline: 'Usage-based billing',
    });
    expect(parseShowHnTitle('Show HN: Type-safe DB')).toEqual({ name: 'Type-safe DB', tagline: null });
    expect(parseShowHnTitle('Show HN: Kettle: a tiny job runner').name).toBe('Kettle');
    expect(hitToCompany({ objectID: '1', title: 'Show HN: Text only', url: null })).toBeNull();
  });

  it('reads Show HN from a recorded Algolia response', async () => {
    const fetch = fakeFetch({ [ALGOLIA_SEARCH]: { body: fixture('sources/algolia-show-hn.json') } });
    const adapter = launchesAdapter({ productHuntToken: undefined, fetch, now });
    const found = await collect(adapter, { days: 2, keyword: 'email', sources: ['show_hn'] });
    expect(found.length).toBeGreaterThan(2);
    expect(found.every((c) => c.source === 'show_hn' && /^https?:\/\//.test(c.website))).toBe(true);
    const url = new URL(fetch.calls[0]!.url);
    expect(url.searchParams.get('tags')).toBe('show_hn');
    expect(url.searchParams.get('query')).toBe('email');
    expect(url.searchParams.get('numericFilters')).toBe(`created_at_i>${Math.floor(now().getTime() / 1000) - 2 * 86_400}`);
  });

  it('reads Product Hunt, follows the redirect to the real site and filters by keyword', async () => {
    const fetch = fakeFetch({
      [PRODUCT_HUNT_GRAPHQL]: { body: fixture('sources/product-hunt-posts.json') },
      'https://www.producthunt.com/r/AAAA1111': { status: 301, headers: { location: 'https://inboxly.io/?ref=producthunt' } },
      'https://inboxly.io/': { body: '<html></html>' },
      'https://www.producthunt.com/r/CCCC3333': { status: 200, body: 'still on product hunt' },
    });
    const adapter = launchesAdapter({ productHuntToken: 'ph-token', fetch, now });
    const found = await collect(adapter, { days: 1, keyword: 'email', sources: ['product_hunt'] });
    expect(found).toEqual([
      { name: 'Inboxly', website: 'https://inboxly.io/?ref=producthunt', source: 'product_hunt', sourceRef: '1001', category: 'Email triage for small teams' },
    ]);
    const gql = fetch.calls.find((c) => c.url === PRODUCT_HUNT_GRAPHQL)!;
    expect(gql.headers.authorization).toBe('Bearer ph-token');
    expect(JSON.parse(gql.body ?? '{}').variables.postedAfter).toBe('2026-10-12T12:00:00.000Z');
  });

  it('matches keywords against name, tagline, description and topics', () => {
    expect(phMatches({ name: 'X', topics: { edges: [{ node: { name: 'Email' } }] } }, 'email')).toBe(true);
    expect(phMatches({ name: 'X', tagline: 'y' }, 'email')).toBe(false);
    expect(phMatches({ name: 'X' }, undefined)).toBe(true);
  });

  it('runs on Show HN alone without a Product Hunt token, and fails when only Product Hunt was asked for', async () => {
    const fetch = fakeFetch({ [ALGOLIA_SEARCH]: { body: fixture('sources/algolia-show-hn.json') } });
    const adapter = launchesAdapter({ productHuntToken: undefined, fetch, now });
    const found = await collect(adapter, { days: 2 });
    expect(found.length).toBeGreaterThan(0);
    await expect(collect(adapter, { days: 2, sources: ['product_hunt'] })).rejects.toThrow(/PRODUCT_HUNT_TOKEN/);
  });
});
