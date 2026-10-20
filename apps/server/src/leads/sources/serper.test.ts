import { describe, expect, it } from 'vitest';
import { fakeFetch, fixture, silentLog } from '../../testing/fakes.js';
import type { CachedWebPage, WebPageKey, WebSearchCache } from '../web-cache.js';
import { SERPER_ENDPOINT, serperProvider, serperResultToCompany } from './serper.js';
import { PermanentError, SourceUnavailableError, type FoundCompany, type SourceAdapter, type SourceContext } from './types.js';
import { BRAVE_ENDPOINT, braveClient, webAdapter } from './web.js';

const ctx = (events: string[] = []): SourceContext => ({
  limit: 50,
  signal: new AbortController().signal,
  log: silentLog,
  onUsage: (e) => void events.push(e),
});

async function collect<P>(adapter: SourceAdapter<P>, params: P, c: SourceContext = ctx()): Promise<FoundCompany[]> {
  const out: FoundCompany[] = [];
  for await (const company of adapter.find(params, c)) out.push(company);
  return out;
}

function memoryCache(): WebSearchCache & { store: Map<string, CachedWebPage> } {
  const store = new Map<string, CachedWebPage>();
  const k = (key: WebPageKey) => `${key.q}|${key.country ?? ''}|${key.page}`;
  return { store, get: async (key) => store.get(k(key)) ?? null, put: async (key, page) => void store.set(k(key), page) };
}

const body = (call: { body?: string }) => JSON.parse(call.body ?? '{}') as Record<string, unknown>;

/** Serper answering `pages` full pages of 10 for any query, then nothing. */
function paged(pages: number) {
  return fakeFetch({
    [SERPER_ENDPOINT]: (_url, init) => {
      const page = Number((JSON.parse(String(init?.body)) as { page: number }).page);
      const organic = page <= pages ? Array.from({ length: 10 }, (_, i) => ({ title: `P${page} ${i}`, link: `https://p${page}-${i}.dk/`, position: i + 1 })) : [];
      return { body: JSON.stringify({ searchParameters: { page }, organic, credits: 1 }) };
    },
  });
}

describe('serper provider', () => {
  it('posts the query with the key in X-API-KEY and maps organic results', async () => {
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: { body: fixture('sources/serper-search.json') } });
    const events: string[] = [];
    const page = await serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 }).fetchPage(
      { q: 'industrial design studio copenhagen', country: 'dk', page: 0 },
      ctx(events),
    );
    expect(fetch.calls[0]!.method).toBe('POST');
    expect(fetch.calls[0]!.headers['x-api-key']).toBe('sk');
    expect(fetch.calls[0]!.headers['content-type']).toBe('application/json');
    expect(body(fetch.calls[0]!)).toEqual({ q: 'industrial design studio copenhagen', gl: 'dk', num: 10, page: 1 });
    // Our page of 20 is Serper's pages 1 and 2 of 10.
    expect(fetch.calls.map((c) => body(c).page)).toEqual([1, 2]);
    expect(events).toEqual(['request', 'request']);
    // The fixture answers both, so each result comes twice; the result without a link is dropped.
    const first = page.companies.slice(0, 9);
    expect(first.map((c) => c.website)).toEqual([
      'https://www.kibisi-studio.dk',
      'https://en.wikipedia.org',
      'https://formlab.example-design.dk',
      'https://nordicshape.dk',
      'https://dk.linkedin.com',
      'https://hjortstudio.dk',
      'https://lineform.dk',
      'https://cphproduct.example.dk',
      'https://oakiron.dk',
    ]);
    expect(first[0]).toEqual({
      name: 'Kibisi Studio',
      website: 'https://www.kibisi-studio.dk',
      source: 'serper',
      sourceRef: 'https://www.kibisi-studio.dk/',
      category: undefined,
      title: 'Kibisi Studio | Industrial design in Copenhagen',
      snippet: 'Kibisi is an industrial design studio in Copenhagen working with furniture, lighting and consumer products.',
    });
    expect(first[2]!.snippet).toBe('Formlab is a Danish product design consultancy. We design medical devices.');
    expect(page.more).toBe(true);
  });

  it('leaves gl out without a country and maps later pages to Serper pages', async () => {
    const fetch = paged(10);
    await serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 }).fetchPage({ q: 'dentists', page: 2 }, ctx());
    expect(fetch.calls.map(body)).toEqual([
      { q: 'dentists', num: 10, page: 5 },
      { q: 'dentists', num: 10, page: 6 },
    ]);
  });

  it('stops after a short page, so no empty page is billed', async () => {
    const fetch = fakeFetch({
      [SERPER_ENDPOINT]: { body: JSON.stringify({ organic: [{ title: 'Only', link: 'https://only.dk/' }] }) },
    });
    const events: string[] = [];
    const page = await serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 }).fetchPage({ q: 'rare', page: 0 }, ctx(events));
    expect(fetch.calls).toHaveLength(1);
    expect(events).toEqual(['request']);
    expect(page).toEqual({ companies: [expect.objectContaining({ website: 'https://only.dk' })], more: false });
  });

  it('pages through the web adapter like Brave: 20 results a page, until a page is short', async () => {
    const fetch = paged(3);
    const adapter = webAdapter(braveClient({ apiKey: undefined, provider: serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 }) }));
    const found = await collect(adapter, { keyword: 'dentists' });
    // Pages 1 to 3 hold 30 results; page 4 comes back empty and ends it.
    expect(found).toHaveLength(30);
    expect(fetch.calls.map((c) => body(c).page)).toEqual([1, 2, 3, 4]);
  });

  it('turns a refused key or spent credit into SourceUnavailableError', async () => {
    for (const res of [
      { status: 401, body: '{"message":"Unauthorized.","statusCode":401}' },
      { status: 403, body: '{"message":"Forbidden","statusCode":403}' },
      { status: 400, body: '{"message":"Not enough credits","statusCode":400}' },
    ]) {
      const fetch = fakeFetch({ [SERPER_ENDPOINT]: res });
      const err = await serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 })
        .fetchPage({ q: 'x', page: 0 }, ctx())
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SourceUnavailableError);
      expect((err as SourceUnavailableError).source).toBe('serper');
      expect((err as SourceUnavailableError).code).toBe('source_unavailable');
    }
    // Any other 400 is a bad query, not a reason to pause web search.
    const bad = fakeFetch({ [SERPER_ENDPOINT]: { status: 400, body: '{"message":"Query is required"}' } });
    const err = await serperProvider({ apiKey: 'sk', fetch: bad, requestsPerSecond: 1_000 })
      .fetchPage({ q: 'x', page: 0 }, ctx())
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(SourceUnavailableError);
  });

  it('waits out a 429 and bills only the answered request', async () => {
    let n = 0;
    const fetch = fakeFetch({
      [SERPER_ENDPOINT]: () => (++n === 1 ? { status: 429, body: '{"message":"Too many requests"}' } : { body: JSON.stringify({ organic: [] }) }),
    });
    const events: string[] = [];
    await serperProvider({ apiKey: 'sk', fetch, requestsPerSecond: 1_000 }).fetchPage({ q: 'x', page: 0 }, ctx(events));
    expect(fetch.calls).toHaveLength(2);
    expect(events).toEqual(['request']);
  });

  it('drops results without a usable link', () => {
    expect(serperResultToCompany({ title: 'x' })).toBeNull();
    expect(serperResultToCompany({ title: 'x', link: 'not a url' })).toBeNull();
  });
});

describe('serper behind the web search client', () => {
  it('fails with a permanent error naming SERPER_API_KEY when the key is missing', async () => {
    const client = braveClient({ apiKey: 'brave-key', provider: serperProvider({ apiKey: undefined, fetch: fakeFetch({}) }) });
    expect(client.configured).toBe(false);
    const err = await client.page({ q: 'x', page: 0 }, ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/SERPER_API_KEY/);
  });

  it('shares cached pages with Brave under the same keys', async () => {
    const cache = memoryCache();
    const braveFetch = fakeFetch({ [BRAVE_ENDPOINT]: { body: fixture('sources/brave-web-search.json') } });
    const brave = braveClient({ apiKey: 'k', fetch: braveFetch, cache, requestsPerSecond: 1_000 });
    const fromBrave = await brave.page({ q: 'design studio', country: 'dk', page: 0 }, ctx());

    const serperFetch = paged(10);
    const serper = braveClient({ apiKey: undefined, cache, provider: serperProvider({ apiKey: 'sk', fetch: serperFetch, requestsPerSecond: 1_000 }) });
    const events: string[] = [];
    // Brave's page answers Serper's identical request for free.
    expect(await serper.page({ q: 'design studio', country: 'dk', page: 0 }, ctx(events))).toEqual(fromBrave);
    expect(serperFetch.calls).toHaveLength(0);
    expect(events).toEqual(['cache_hit']);

    // And a page Serper fetched is free for Brave later.
    await serper.page({ q: 'design studio', country: 'dk', page: 1 }, ctx());
    expect(serperFetch.calls).toHaveLength(2);
    const later = await brave.page({ q: 'design studio', country: 'dk', page: 1 }, ctx());
    expect(later.companies[0]!.source).toBe('serper');
    expect(braveFetch.calls).toHaveLength(1);
  });
});
