import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecrets } from '../../crypto/secrets.js';
import { ensureAccount } from '../quota.js';
import { saveSearchKey, type OwnSearchKey } from '../search-keys.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { fakeFetch, silentLog, type FakeResponse } from '../../testing/fakes.js';
import type { CachedWebPage, WebPageKey, WebSearchCache } from '../web-cache.js';
import { createAdapters } from './index.js';
import { checkSearchKey, ownSearchClient } from './own-search.js';
import { SERPER_ENDPOINT } from './serper.js';
import { PermanentError, SourceUnavailableError, type FoundCompany, type SourceAdapter, type SourceContext } from './types.js';
import { BRAVE_ENDPOINT, type BraveClient, type BravePageRequest } from './web.js';

const SERPER_KEY = 'serper-own-key-0000000000001234';
const BRAVE_KEY = 'brave-own-key-00000000000005678';

const ctx = (events: string[] = [], userId?: string): SourceContext => ({
  limit: 50,
  signal: new AbortController().signal,
  log: silentLog,
  onUsage: (e) => void events.push(e),
  ...(userId ? { userId } : {}),
});

function memoryCache(): WebSearchCache & { store: Map<string, CachedWebPage> } {
  const store = new Map<string, CachedWebPage>();
  const k = (key: WebPageKey) => `${key.q}|${key.country ?? ''}|${key.page}`;
  return { store, get: async (key) => store.get(k(key)) ?? null, put: async (key, page) => void store.set(k(key), page) };
}

const OURS_PAGE: CachedWebPage = { companies: [{ name: 'Ours', website: 'https://ours.dk', source: 'brave', sourceRef: 'https://ours.dk/', category: undefined }], more: false };

/** Our search client, recording the pages it was asked for. It never touches the network. */
function oursClient(): BraveClient & { calls: BravePageRequest[] } {
  const calls: BravePageRequest[] = [];
  return {
    calls,
    configured: true,
    async page(req, c) {
      calls.push(req);
      c.onUsage?.('request');
      return OURS_PAGE;
    },
  };
}

// One short page each: one paid request per page of ours.
const SERPER_OK: FakeResponse = { body: JSON.stringify({ organic: [{ title: 'Own Serper Hit', link: 'https://own-serper.dk/' }] }) };
const BRAVE_OK: FakeResponse = {
  body: JSON.stringify({ web: { results: [{ title: 'Own Brave Hit', url: 'https://own-brave.dk/' }] }, query: { more_results_available: false } }),
};

const keys = (map: Record<string, OwnSearchKey>) => async (userId: string) => map[userId] ?? null;
const REQ: BravePageRequest = { q: 'design studio', country: 'dk', page: 0 };

describe('ownSearchClient', () => {
  it('uses our client without a user or without a key', async () => {
    const ours = oursClient();
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK, [BRAVE_ENDPOINT]: BRAVE_OK });
    const asked: string[] = [];
    const client = ownSearchClient(ours, {
      fetch,
      cache: memoryCache(),
      ownKey: async (userId) => {
        asked.push(userId);
        return null;
      },
    });

    const events: string[] = [];
    expect(await client.page(REQ, ctx(events))).toBe(OURS_PAGE);
    expect(asked).toEqual([]);
    expect(await client.page(REQ, ctx(events, 'alice'))).toBe(OURS_PAGE);
    expect(asked).toEqual(['alice']);
    expect(ours.calls).toHaveLength(2);
    expect(events).toEqual(['request', 'request']);
    expect(fetch.calls).toEqual([]);
    expect(client.configured).toBe(true);
  });

  it('runs a Serper key on Serper, reports own_request and serves a repeat from the cache', async () => {
    const ours = oursClient();
    const cache = memoryCache();
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK, [BRAVE_ENDPOINT]: { status: 500 } });
    const client = ownSearchClient(ours, { fetch, cache, ownKey: keys({ alice: { provider: 'serper', apiKey: SERPER_KEY } }) });

    const events: string[] = [];
    const page = await client.page(REQ, ctx(events, 'alice'));
    expect(page.companies.map((c) => c.website)).toEqual(['https://own-serper.dk']);
    expect(ours.calls).toEqual([]);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]!.url).toBe(SERPER_ENDPOINT);
    expect(fetch.calls[0]!.headers['x-api-key']).toBe(SERPER_KEY);
    expect(events).toEqual(['own_request']);
    expect(cache.store.size).toBe(1);

    const again: string[] = [];
    expect(await client.page(REQ, ctx(again, 'alice'))).toEqual(page);
    expect(fetch.calls).toHaveLength(1);
    expect(again).toEqual(['cache_hit']);
    expect(ours.calls).toEqual([]);
  });

  it('runs a Brave key on Brave with the key in X-Subscription-Token', async () => {
    const ours = oursClient();
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: { status: 500 } });
    const client = ownSearchClient(ours, { fetch, cache: memoryCache(), ownKey: keys({ bob: { provider: 'brave', apiKey: BRAVE_KEY } }) });

    const events: string[] = [];
    const page = await client.page(REQ, ctx(events, 'bob'));
    expect(page.companies.map((c) => c.website)).toEqual(['https://own-brave.dk']);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]!.url.startsWith(BRAVE_ENDPOINT)).toBe(true);
    expect(fetch.calls[0]!.headers['x-subscription-token']).toBe(BRAVE_KEY);
    expect(events).toEqual(['own_request']);
    expect(ours.calls).toEqual([]);
  });

  it('fails a refused key as a permanent error naming the provider, never falling back to ours', async () => {
    const ours = oursClient();
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: { status: 401, body: 'Unauthorized' }, [BRAVE_ENDPOINT]: { status: 401, body: 'bad token' } });
    const client = ownSearchClient(ours, {
      fetch,
      cache: memoryCache(),
      ownKey: keys({ alice: { provider: 'serper', apiKey: SERPER_KEY }, bob: { provider: 'brave', apiKey: BRAVE_KEY } }),
    });

    const serper = await client.page(REQ, ctx([], 'alice')).catch((err: unknown) => err);
    expect(serper).toBeInstanceOf(PermanentError);
    expect(serper).not.toBeInstanceOf(SourceUnavailableError);
    expect((serper as Error).message).toMatch(/your own Serper key was refused/);
    expect((serper as Error).message).toMatch(/401/);

    const brave = await client.page(REQ, ctx([], 'bob')).catch((err: unknown) => err);
    expect(brave).toBeInstanceOf(PermanentError);
    expect((brave as Error).message).toMatch(/your own Brave Search key was refused/);

    expect(ours.calls).toEqual([]);
  });

  it('lets an error from opening the key through, without searching', async () => {
    const ours = oursClient();
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK });
    const client = ownSearchClient(ours, {
      fetch,
      ownKey: async () => {
        throw new PermanentError('your own search key cannot be opened');
      },
    });
    await expect(client.page(REQ, ctx([], 'alice'))).rejects.toThrow('your own search key cannot be opened');
    expect(ours.calls).toEqual([]);
    expect(fetch.calls).toEqual([]);
  });
});

describe('checkSearchKey', () => {
  const key: OwnSearchKey = { provider: 'serper', apiKey: SERPER_KEY };

  it('is ok when the key answers', async () => {
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK });
    expect(await checkSearchKey(key, { log: silentLog }, fetch)).toEqual({ ok: true });
    expect(fetch.calls[0]!.headers['x-api-key']).toBe(SERPER_KEY);
  });

  it('says why a refused key was refused', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { status: 403, body: 'plan refused' } });
    const res = await checkSearchKey({ provider: 'brave', apiKey: BRAVE_KEY }, { log: silentLog }, fetch);
    expect(res).toMatchObject({ ok: false, code: 'search_key_rejected' });
    expect(res.ok === false && res.code === 'search_key_rejected' && res.detail).toMatch(/refused \(403 plan refused\)/);
  });

  it('is unavailable on any other failure', async () => {
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: { status: 500, body: 'oops' } });
    expect(await checkSearchKey(key, { log: silentLog }, fetch)).toEqual({ ok: false, code: 'source_unavailable' });
  });
});

describe('createAdapters with an account key', () => {
  let db: TestDb;
  const secrets = createSecrets(randomBytes(32).toString('base64'));
  const base = {
    NOMINATIM_URL: 'https://nominatim.test',
    OVERPASS_URL: ['https://overpass.test'],
    BRAVE_SEARCH_API_KEY: 'our-brave-key',
    BRAVE_REQUESTS_PER_SECOND: 1_000,
    PRODUCT_HUNT_TOKEN: undefined,
    FREE_SEARCH: 'off' as const,
  };
  const ourBrave: FakeResponse = {
    body: JSON.stringify({ web: { results: [{ title: 'Our Hit', url: 'https://our-hit.dk/' }] }, query: { more_results_available: false } }),
  };

  async function collect<P>(adapter: SourceAdapter<P>, params: P, c: SourceContext): Promise<FoundCompany[]> {
    const out: FoundCompany[] = [];
    for await (const company of adapter.find(params, c)) out.push(company);
    return out;
  }

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await db.sql`truncate accounts, web_search_cache cascade`;
    await ensureAccount(db.sql, 'alice');
    await ensureAccount(db.sql, 'bob');
    await saveSearchKey(db.sql, secrets, 'alice', { provider: 'serper', apiKey: SERPER_KEY });
  });

  it('runs a web search for an account with a key on its own provider, and ours for the rest', async () => {
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK, [BRAVE_ENDPOINT]: ourBrave });
    const adapters = createAdapters(base, { fetch, sql: db.sql, secrets, resolveName: null });

    const events: string[] = [];
    const found = await collect(adapters.web, { keyword: 'design studio', country: 'dk' }, ctx(events, 'alice'));
    expect(found.map((c) => c.website)).toEqual(['https://own-serper.dk']);
    expect(fetch.calls.map((c) => c.url)).toEqual([SERPER_ENDPOINT]);
    expect(fetch.calls[0]!.headers['x-api-key']).toBe(SERPER_KEY);
    expect(events).toEqual(['own_request']);

    const ours = await collect(adapters.web, { keyword: 'other studio', country: 'dk' }, ctx([], 'bob'));
    expect(ours.map((c) => c.website)).toEqual(['https://our-hit.dk']);
    expect(fetch.calls[1]!.url.startsWith(BRAVE_ENDPOINT)).toBe(true);
    expect(fetch.calls[1]!.headers['x-subscription-token']).toBe('our-brave-key');
  });

  it('fails a search whose stored key cannot be opened, never using ours', async () => {
    const fetch = fakeFetch({ [SERPER_ENDPOINT]: SERPER_OK, [BRAVE_ENDPOINT]: ourBrave });
    const other = createSecrets(randomBytes(32).toString('base64'));

    const wrongKey = createAdapters(base, { fetch, sql: db.sql, secrets: other, resolveName: null });
    await expect(collect(wrongKey.web, { keyword: 'design studio' }, ctx([], 'alice'))).rejects.toThrow(/cannot be opened.*Save it again/);

    const noSecrets = createAdapters(base, { fetch, sql: db.sql, secrets: null, resolveName: null });
    await expect(collect(noSecrets.web, { keyword: 'design studio' }, ctx([], 'alice'))).rejects.toThrow(/SECRETS_KEY is not set/);
    expect(fetch.calls).toEqual([]);

    // Without a key, no secrets is fine: our client answers.
    expect(await collect(noSecrets.web, { keyword: 'design studio' }, ctx([], 'bob'))).toHaveLength(1);
  });
});
