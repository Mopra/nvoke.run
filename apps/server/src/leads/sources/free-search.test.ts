import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, fixture, silentLog } from '../../testing/fakes.js';
import type { CachedWebPage, WebPageKey, WebSearchCache } from '../web-cache.js';
import {
  FreeSearchBlockedError,
  MWMBL_ENDPOINT,
  freeClient,
  freeSearchMode,
  looksLikeChallenge,
  mwmblProvider,
  plainQuery,
  searchClient,
  type FreeProvider,
} from './free-search.js';
import { SourceUnavailableError, type FoundCompany, type SourceContext } from './types.js';
import { BRAVE_ENDPOINT, braveClient, type BraveClient } from './web.js';

function memoryCache(): WebSearchCache & { rows: Map<string, CachedWebPage> } {
  const rows = new Map<string, CachedWebPage>();
  const k = (key: WebPageKey) => `${key.q}|${key.country ?? ''}|${key.page}`;
  return {
    rows,
    get: async (key) => rows.get(k(key)) ?? null,
    put: async (key, page) => void rows.set(k(key), page),
  };
}

function ctx(extra: Partial<SourceContext> = {}): SourceContext {
  return { limit: 50, signal: new AbortController().signal, log: silentLog, ...extra };
}

const company = (domain: string, sourceRef?: string): FoundCompany => ({ name: domain, website: `https://${domain}`, source: 'mwmbl', sourceRef: sourceRef ?? `https://${domain}/` });

/** A provider that answers from a table of words and counts its calls. */
function tableProvider(table: Record<string, FoundCompany[]>): FreeProvider & { asked: string[] } {
  const asked: string[] = [];
  return {
    name: 'mwmbl',
    asked,
    async search(words) {
      asked.push(words);
      return table[words] ?? [];
    },
  };
}

describe('free search (Mwmbl)', () => {
  it('reads FREE_SEARCH, defaulting to fallback (owner accepted Mwmbl on 2026-10-18)', () => {
    expect(freeSearchMode(undefined)).toBe('fallback');
    expect(freeSearchMode('OFF')).toBe('off');
    expect(freeSearchMode('first')).toBe('first');
    expect(freeSearchMode('nonsense')).toBe('fallback');
  });

  it('turns a Brave query into plain words and keeps the site: hosts', () => {
    expect(plainQuery('"account executive" (site:jobs.lever.co OR site:boards.greenhouse.io) -intern')).toEqual({
      words: 'account executive',
      sites: ['jobs.lever.co', 'boards.greenhouse.io'],
    });
    expect(plainQuery('b2b lead generation agency')).toEqual({ words: 'b2b lead generation agency', sites: [] });
  });

  it('parses a recorded Mwmbl answer into companies, as nvokebot', async () => {
    const f = fakeFetch({ [MWMBL_ENDPOINT]: { body: fixture('sources/mwmbl-search.json'), headers: { 'content-type': 'application/json' } } });
    const found = await mwmblProvider({ fetch: f, intervalMs: 1 }).search('b2b lead generation agency', ctx());
    expect(found).toHaveLength(7);
    expect(found[0]).toMatchObject({ website: 'https://revnew.com', source: 'mwmbl', sourceRef: 'https://revnew.com' });
    expect(found[1]!.name).toBe('Belkins');
    expect(found[0]!.title).toContain('B2B Lead Generation Agency');
    expect(found[0]!.snippet).toBeTruthy();
    expect(f.calls[0]!.url).toBe(`${MWMBL_ENDPOINT}?s=b2b+lead+generation+agency`);
    expect(f.calls[0]!.headers['user-agent']).toMatch(/^nvokebot\//);
  });

  it('recognises a challenge page, such as DuckDuckGo puzzle', () => {
    expect(looksLikeChallenge(fixture('sources/duckduckgo-challenge.html'))).toBe(true);
    expect(looksLikeChallenge(fixture('sources/mwmbl-search.json'))).toBe(false);
  });

  it('stops at a challenge or a 429, records the pause and leaves the provider alone', async () => {
    for (const res of [{ status: 202, body: fixture('sources/duckduckgo-challenge.html') }, { status: 429, body: 'slow down' }]) {
      const f = fakeFetch({ [MWMBL_ENDPOINT]: res });
      const onBlocked = vi.fn(async () => {});
      const client = freeClient({ provider: mwmblProvider({ fetch: f, intervalMs: 1 }), onBlocked });
      await expect(client.page({ q: 'x y', page: 0 }, ctx())).rejects.toBeInstanceOf(FreeSearchBlockedError);
      expect(client.blocked()).toBe(true);
      await expect(client.page({ q: 'other words', page: 0 }, ctx())).rejects.toBeInstanceOf(FreeSearchBlockedError);
      // One request: no retry, no second try around the refusal.
      expect(f.calls).toHaveLength(1);
      expect(onBlocked).toHaveBeenCalledTimes(1);
      expect(client.stats.blocked).toBe(1);
    }
  });

  it('never takes results that mention a captcha for a challenge', async () => {
    const body = JSON.stringify([{ url: 'https://captcha-solver.example', title: [{ value: 'Captcha help: unusual traffic, are you a robot?' }], extract: [] }]);
    for (const contentType of ['application/json', 'text/html; charset=utf-8']) {
      const f = fakeFetch({ [MWMBL_ENDPOINT]: { body, headers: { 'content-type': contentType } } });
      const client = freeClient({ provider: mwmblProvider({ fetch: f, intervalMs: 1 }) });
      expect((await client.page({ q: 'captcha', page: 0 }, ctx())).companies).toHaveLength(1);
      expect(client.blocked()).toBe(false);
    }
  });

  it('tries once more on an empty answer, then gives up', async () => {
    let n = 0;
    const f = fakeFetch({ [MWMBL_ENDPOINT]: () => (++n === 1 ? { body: '' } : { body: fixture('sources/mwmbl-search.json') }) });
    expect(await mwmblProvider({ fetch: f, intervalMs: 1 }).search('x', ctx())).toHaveLength(7);
    expect(f.calls).toHaveLength(2);
  });

  it('caches pages under its own key, adds the country and drops it when that finds nothing', async () => {
    const cache = memoryCache();
    const provider = tableProvider({ 'sales agency': [company('a.dk')] });
    const client = freeClient({ provider, cache });
    const first = await client.page({ q: 'sales agency', country: 'dk', page: 0 }, ctx());
    expect(first).toEqual({ companies: [company('a.dk')], more: false });
    expect(provider.asked).toEqual(['sales agency Denmark', 'sales agency']);
    expect([...cache.rows.keys()]).toEqual(['sales agency|mwmbl:dk|0']);

    const onUsage = vi.fn();
    expect(await client.page({ q: 'sales agency', country: 'dk', page: 0 }, ctx({ onUsage }))).toEqual(first);
    expect(provider.asked).toHaveLength(2);
    // Free requests and hits are never priced as Brave's.
    expect(onUsage).not.toHaveBeenCalled();
    expect(client.stats).toEqual({ requests: 2, cacheHits: 1, blocked: 0 });
    // Everything comes in one page.
    expect(await client.page({ q: 'sales agency', country: 'dk', page: 1 }, ctx())).toEqual({ companies: [], more: false });
    expect(provider.asked).toHaveLength(2);
  });

  it('skips a query that times out, and counts the provider down after five in a row', async () => {
    const slow: FreeProvider = {
      name: 'mwmbl',
      search: async () => {
        throw new Error('The operation was aborted due to timeout');
      },
    };
    const cache = memoryCache();
    const client = freeClient({ provider: slow, cache });
    for (let i = 0; i < 4; i++) expect(await client.page({ q: `q${i}`, page: 0 }, ctx())).toEqual({ companies: [], more: false });
    // Failures are not cached, so the query is tried again later.
    expect(cache.rows.size).toBe(0);
    await expect(client.page({ q: 'q4', page: 0 }, ctx())).rejects.toBeInstanceOf(FreeSearchBlockedError);
    expect(client.blocked()).toBe(true);
  });

  it('keeps an empty answer for the day only', async () => {
    const cache = memoryCache();
    const provider = tableProvider({});
    let t = Date.parse('2026-10-18T10:00:00Z');
    const client = freeClient({ provider, cache, now: () => t });
    expect((await client.page({ q: 'nothing here', page: 0 }, ctx())).companies).toEqual([]);
    expect([...cache.rows.keys()]).toEqual(['nothing here|mwmbl::empty:2026-10-18|0']);
    await client.page({ q: 'nothing here', page: 0 }, ctx());
    expect(provider.asked).toEqual(['nothing here']);
    // The next day asks again.
    t = Date.parse('2026-10-19T10:00:00Z');
    await client.page({ q: 'nothing here', page: 0 }, ctx());
    expect(provider.asked).toEqual(['nothing here', 'nothing here']);
  });

  it('drops the last word of a long query that finds nothing', async () => {
    const provider = tableProvider({ 'outbound sales consultancy': [company('b.co.uk')] });
    const page = await freeClient({ provider }).page({ q: 'outbound sales consultancy london', page: 0 }, ctx());
    expect(page.companies).toHaveLength(1);
    expect(provider.asked).toEqual(['outbound sales consultancy london', 'outbound sales consultancy']);
  });

  it('holds results to the site: hosts a query named', async () => {
    const provider = tableProvider({
      'account executive': [company('builtin.com', 'https://builtin.com/job/1'), company('jobs.lever.co', 'https://jobs.lever.co/acme/123')],
    });
    const page = await freeClient({ provider }).page({ q: '"account executive" (site:jobs.lever.co OR site:apply.workable.com)', page: 0 }, ctx());
    expect(page.companies.map((c) => c.sourceRef)).toEqual(['https://jobs.lever.co/acme/123']);
  });
});

describe('web search with the free fallback', () => {
  const braveBody = { body: fixture('sources/brave-web-search.json'), headers: { 'content-type': 'application/json' } };

  it('is the Brave client itself when FREE_SEARCH is off', () => {
    const brave = braveClient({ apiKey: 'k' });
    expect(searchClient({ brave, free: freeClient({ provider: tableProvider({}) }), mode: 'off' })).toBe(brave);
  });

  it('falls over to the free provider when Brave runs out of credit, for the rest of the pause, and says so once', async () => {
    const f = fakeFetch({ [BRAVE_ENDPOINT]: { status: 402, body: '{"error":"Prepaid credit balance is insufficient"}' } });
    const brave = braveClient({ apiKey: 'k', fetch: f, requestsPerSecond: 1_000 });
    const provider = tableProvider({ dentists: [company('a.dk')], plumbers: [company('b.dk')] });
    const onUnavailable = vi.fn(async (_err: SourceUnavailableError) => {});
    const client = searchClient({ brave, free: freeClient({ provider }), mode: 'fallback', onUnavailable });
    const onStage = vi.fn(async () => {});
    const onUsage = vi.fn();
    const c = ctx({ onStage, onUsage });

    expect((await client.page({ q: 'dentists', page: 0 }, c)).companies).toEqual([company('a.dk')]);
    expect((await client.page({ q: 'plumbers', page: 0 }, c)).companies).toEqual([company('b.dk')]);
    // Brave was asked once, then left alone.
    expect(f.calls).toHaveLength(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onUnavailable.mock.calls[0]![0].source).toBe('brave');
    expect(onStage).toHaveBeenCalledTimes(1);
    expect(onStage).toHaveBeenCalledWith('fallback', expect.stringContaining('Mwmbl, a free search engine'));
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('still serves pages Brave answered before from the cache while it is down', async () => {
    const cache = memoryCache();
    const hit: CachedWebPage = { companies: [company('cached.dk')], more: true };
    await cache.put({ q: 'dentists', page: 0 }, hit);
    const f = fakeFetch({ [BRAVE_ENDPOINT]: braveBody });
    const brave = braveClient({ apiKey: 'k', fetch: f, cache, requestsPerSecond: 1_000 });
    const provider = tableProvider({});
    const client = searchClient({ brave, free: freeClient({ provider }), mode: 'fallback', bravePaused: async () => true });
    const onUsage = vi.fn();
    expect(await client.page({ q: 'dentists', page: 0 }, ctx({ onUsage }))).toEqual(hit);
    expect(onUsage).toHaveBeenCalledWith('cache_hit');
    expect(f.calls).toHaveLength(0);
    expect(provider.asked).toHaveLength(0);
  });

  it('answers from the free provider when Brave has no key', async () => {
    const client = searchClient({ brave: braveClient({ apiKey: undefined }), free: freeClient({ provider: tableProvider({ x: [company('x.io')] }) }), mode: 'fallback' });
    expect(client.configured).toBe(true);
    expect((await client.page({ q: 'x', page: 0 }, ctx())).companies).toHaveLength(1);
  });

  it('fails with Brave own refusal when the free provider refuses too', async () => {
    const brave: BraveClient = {
      configured: true,
      page: async () => {
        throw new SourceUnavailableError('brave', 'the key or plan was refused (402)');
      },
    };
    const blocked: FreeProvider = {
      name: 'mwmbl',
      search: async () => {
        throw new FreeSearchBlockedError('mwmbl', 'refused us (429)');
      },
    };
    const err = await searchClient({ brave, free: freeClient({ provider: blocked }), mode: 'fallback' })
      .page({ q: 'x', page: 0 }, ctx())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceUnavailableError);
    expect((err as SourceUnavailableError).source).toBe('brave');
    expect((err as SourceUnavailableError).reason).toContain('402');
  });

  it('asks the free provider first in first mode, and Brave when it finds nothing', async () => {
    const f = fakeFetch({ [BRAVE_ENDPOINT]: braveBody });
    const brave = braveClient({ apiKey: 'k', fetch: f, requestsPerSecond: 1_000 });
    const provider = tableProvider({ dentists: [company('a.dk')] });
    const client = searchClient({ brave, free: freeClient({ provider }), mode: 'first' });
    expect((await client.page({ q: 'dentists', page: 0 }, ctx())).companies).toEqual([company('a.dk')]);
    expect(f.calls).toHaveLength(0);
    const onUsage = vi.fn();
    const fromBrave = await client.page({ q: 'rare words', page: 0 }, ctx({ onUsage }));
    expect(fromBrave.companies.length).toBeGreaterThan(0);
    expect(f.calls).toHaveLength(1);
    expect(onUsage).toHaveBeenCalledWith('request');
    // Later pages go to Brave.
    await client.page({ q: 'rare words', page: 1 }, ctx());
    expect(f.calls).toHaveLength(2);
  });
});
