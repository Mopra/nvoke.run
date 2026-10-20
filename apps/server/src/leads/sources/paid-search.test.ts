import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Alert, Alerter } from '../../alerts.js';
import { loadEnv } from '../../env.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { fakeFetch, fixture, silentLog, type FakeResponse } from '../../testing/fakes.js';
import { createAdapters } from './index.js';
import {
  braveAlone,
  dbWebSearchUsage,
  paidSearchChain,
  paidSearchFromEnv,
  webSearchConfigured,
  webSearchCostPer1000,
  type PaidSearchEnv,
  type WebSearchProviderName,
  type WebSearchUsage,
} from './paid-search.js';
import { SERPER_ENDPOINT } from './serper.js';
import { SourceUnavailableError, type FoundCompany, type SourceAdapter, type SourceContext } from './types.js';
import { BRAVE_ENDPOINT } from './web.js';

const ctx = (events: string[] = []): SourceContext => ({
  limit: 50,
  signal: new AbortController().signal,
  log: silentLog,
  onUsage: (e) => void events.push(e),
});

async function collect<P>(adapter: SourceAdapter<P>, params: P): Promise<FoundCompany[]> {
  const out: FoundCompany[] = [];
  for await (const company of adapter.find(params, ctx())) out.push(company);
  return out;
}

const BRAVE_OK: FakeResponse = { body: fixture('sources/brave-web-search.json') };
// One short page: one Serper request per page of ours.
const SERPER_OK: FakeResponse = { body: JSON.stringify({ organic: [{ title: 'Serper Hit', link: 'https://serper-hit.dk/' }] }) };

function memoryUsage(): WebSearchUsage & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  const k = (p: string, now: Date) => `${p}|${now.toISOString().slice(0, 7)}`;
  return {
    rows,
    add: async (p, n, now) => void rows.set(k(p, now), (rows.get(k(p, now)) ?? 0) + n),
    month: async (p, now) => rows.get(k(p, now)) ?? 0,
  };
}

function memoryAlerts(): Alerter & { sent: Alert[] } {
  const sent: Alert[] = [];
  return { sent, send: async (a) => (sent.push(a), true) };
}

const BOTH: PaidSearchEnv = {
  BRAVE_SEARCH_API_KEY: 'bk',
  BRAVE_REQUESTS_PER_SECOND: 1_000,
  WEB_SEARCH_PROVIDER: 'brave',
  WEB_SEARCH_FALLBACK: 'serper',
  SERPER_API_KEY: 'sk',
};

const sources = (calls: { url: string }[]) => calls.map((c) => (c.url.startsWith(BRAVE_ENDPOINT) ? 'brave' : c.url === SERPER_ENDPOINT ? 'serper' : c.url));

describe('paid web search set up', () => {
  it('is Brave alone unless a provider or fallback says otherwise', () => {
    expect(paidSearchChain({})).toEqual(['brave']);
    expect(braveAlone({})).toBe(true);
    expect(braveAlone({ WEB_SEARCH_FALLBACK: 'brave' })).toBe(true);
    expect(paidSearchChain({ WEB_SEARCH_PROVIDER: 'serper' })).toEqual(['serper']);
    expect(paidSearchChain({ WEB_SEARCH_FALLBACK: 'serper' })).toEqual(['brave', 'serper']);
    expect(paidSearchChain({ WEB_SEARCH_PROVIDER: 'serper', WEB_SEARCH_FALLBACK: 'brave' })).toEqual(['serper', 'brave']);
  });

  it('reads the variables, with an empty fallback meaning none', () => {
    expect(loadEnv({}).WEB_SEARCH_PROVIDER).toBe('brave');
    expect(loadEnv({}).WEB_SEARCH_FALLBACK).toBeUndefined();
    expect(loadEnv({ WEB_SEARCH_FALLBACK: '' }).WEB_SEARCH_FALLBACK).toBeUndefined();
    expect(loadEnv({ WEB_SEARCH_FALLBACK: 'serper' }).WEB_SEARCH_FALLBACK).toBe('serper');
    expect(loadEnv({}).SERPER_COST_PER_1000_USD).toBe(1);
    expect(() => loadEnv({ WEB_SEARCH_PROVIDER: 'google' })).toThrow(/WEB_SEARCH_PROVIDER/);
  });

  it('prices and configures by the provider in use', () => {
    expect(webSearchCostPer1000({ BRAVE_SEARCH_API_KEY: 'k', BRAVE_COST_PER_1000_USD: 5 })).toBe(5);
    expect(webSearchCostPer1000({ BRAVE_SEARCH_API_KEY: 'k', WEB_SEARCH_PROVIDER: 'serper', SERPER_COST_PER_1000_USD: 0.75 })).toBe(0.75);
    expect(webSearchConfigured({ BRAVE_SEARCH_API_KEY: 'k' })).toBe(true);
    expect(webSearchConfigured({ BRAVE_SEARCH_API_KEY: 'k', WEB_SEARCH_PROVIDER: 'serper' })).toBe(false);
    expect(webSearchConfigured({ BRAVE_SEARCH_API_KEY: undefined, WEB_SEARCH_FALLBACK: 'serper', SERPER_API_KEY: 'sk' })).toBe(true);
  });
});

describe('createAdapters with the paid web searches', () => {
  const base = { NOMINATIM_URL: 'https://nominatim.test', OVERPASS_URL: ['https://overpass.test'], BRAVE_REQUESTS_PER_SECOND: 1_000, PRODUCT_HUNT_TOKEN: undefined, FREE_SEARCH: 'off' as const };

  it('asks Brave and never Serper by default, even with a Serper key', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: { status: 500 } });
    await collect(createAdapters({ ...base, BRAVE_SEARCH_API_KEY: 'k', SERPER_API_KEY: 'sk' }, { fetch }).web, { keyword: 'design studio', country: 'dk' });
    expect(fetch.calls.length).toBeGreaterThan(0);
    expect(new Set(sources(fetch.calls))).toEqual(new Set(['brave']));
  });

  it('asks Serper alone as the primary, with countries outside Brave named in the query', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: SERPER_OK });
    const found = await collect(
      createAdapters({ ...base, BRAVE_SEARCH_API_KEY: 'k', WEB_SEARCH_PROVIDER: 'serper', SERPER_API_KEY: 'sk' }, { fetch }).web,
      { keyword: 'design studio', country: 'ie' },
    );
    expect(found.map((c) => c.website)).toEqual(['https://serper-hit.dk']);
    expect(sources(fetch.calls)).toEqual(['serper']);
    expect(JSON.parse(fetch.calls[0]!.body!)).toEqual({ q: 'design studio Ireland', num: 10, page: 1 });
  });

  const refusalAlerts = async (routes: { brave: FakeResponse; serper: FakeResponse }, freeSearch: 'off' | 'fallback') => {
    const alerts = memoryAlerts();
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: routes.brave, [SERPER_ENDPOINT]: routes.serper });
    const adapters = createAdapters({ ...base, ...BOTH, FREE_SEARCH: freeSearch }, { fetch, alert: alerts, resolveName: null });
    await collect(adapters.web, { keyword: 'design studio' }).catch(() => undefined);
    return alerts.sent;
  };

  it('alerts once per refusing provider, naming the one that answered instead', async () => {
    const sent = await refusalAlerts({ brave: { status: 402, body: 'no credit' }, serper: SERPER_OK }, 'fallback');
    expect(sent.map((a) => a.key)).toEqual(['source-unavailable:brave']);
    expect(sent[0]!.text).toMatch(/Web searches use serper for the next/);
  });

  it('alerts once for each paid search when both refuse, naming the free fallback', async () => {
    const sent = await refusalAlerts({ brave: { status: 402, body: 'no credit' }, serper: { status: 403, body: 'no' } }, 'fallback');
    expect(sent.map((a) => a.key)).toEqual(['source-unavailable:brave', 'source-unavailable:serper']);
    for (const a of sent) expect(a.text).toMatch(/Web searches use the free fallback/);
  });

  it('says searches fail when both refuse and the free fallback is off', async () => {
    const sent = await refusalAlerts({ brave: { status: 402, body: 'no credit' }, serper: { status: 403, body: 'no' } }, 'off');
    expect(sent.map((a) => a.key)).toEqual(['source-unavailable:brave', 'source-unavailable:serper']);
    for (const a of sent) expect(a.text).toMatch(/the free fallback is off/);
  });

  it('falls back to Serper when Brave is out of credit', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { status: 402, body: 'payment required' }, [SERPER_ENDPOINT]: SERPER_OK });
    const found = await collect(createAdapters({ ...base, ...BOTH }, { fetch }).web, { keyword: 'design studio' });
    expect(found.map((c) => c.source)).toEqual(['serper']);
    expect(sources(fetch.calls)).toEqual(['brave', 'serper']);
  });
});

describe('paid search client', () => {
  const client = (env: Partial<PaidSearchEnv>, routes: { brave?: FakeResponse | (() => FakeResponse); serper?: FakeResponse | (() => FakeResponse) }, extra: Parameters<typeof paidSearchFromEnv>[1] = {}) => {
    const fetch = fakeFetch({
      ...(routes.brave ? { [BRAVE_ENDPOINT]: routes.brave } : {}),
      ...(routes.serper ? { [SERPER_ENDPOINT]: routes.serper } : {}),
    });
    const unavailable: SourceUnavailableError[] = [];
    const answeredBy: (WebSearchProviderName | null)[] = [];
    const c = paidSearchFromEnv(
      { ...BOTH, ...env },
      { fetch, onUnavailable: async (e, by) => void (unavailable.push(e), answeredBy.push(by)), ...extra },
    );
    return { c, fetch, unavailable, answeredBy };
  };
  const req = { q: 'design studio', page: 0 };

  it('marks a refusing primary down and sends later pages straight to the fallback', async () => {
    const { c, fetch, unavailable, answeredBy } = client({}, { brave: { status: 401, body: 'bad key' }, serper: SERPER_OK });
    expect((await c.page(req, ctx())).companies[0]!.source).toBe('serper');
    expect(unavailable.map((e) => e.source)).toEqual(['brave']);
    expect(answeredBy).toEqual(['serper']);
    await c.page({ ...req, page: 1 }, ctx());
    expect(sources(fetch.calls)).toEqual(['brave', 'serper', 'serper']);
  });

  it('falls back on a plain failure without marking the primary down', async () => {
    let n = 0;
    const { c, fetch, unavailable } = client({}, { brave: () => (++n === 1 ? { status: 500, body: 'oops' } : BRAVE_OK), serper: SERPER_OK });
    expect((await c.page(req, ctx())).companies[0]!.source).toBe('serper');
    expect((await c.page({ ...req, page: 1 }, ctx())).companies[0]!.source).toBe('brave');
    expect(sources(fetch.calls)).toEqual(['brave', 'serper', 'brave']);
    expect(unavailable).toEqual([]);
  });

  it('skips a primary paused by another process', async () => {
    const asked: string[] = [];
    const { c, fetch } = client({}, { brave: BRAVE_OK, serper: SERPER_OK }, { paused: async (name) => (asked.push(name), name === 'brave') });
    await c.page(req, ctx());
    expect(sources(fetch.calls)).toEqual(['serper']);
    expect(asked).toContain('brave');
  });

  it('throws the last refusal when both are out, so the free search takes over', async () => {
    const { c, unavailable, answeredBy } = client({}, { brave: { status: 402, body: 'no credit' }, serper: { status: 403, body: 'no' } });
    const err = await c.page(req, ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceUnavailableError);
    expect((err as SourceUnavailableError).source).toBe('serper');
    expect(unavailable.map((e) => e.source)).toEqual(['brave', 'serper']);
    // Neither answered: no refusal says the other one did.
    expect(answeredBy).toEqual([null, null]);
    // Both down: no request at all, the refusal straight away.
    await expect(c.page({ ...req, page: 1 }, ctx())).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('counts paid requests per provider and for the search', async () => {
    const usage = memoryUsage();
    const events: string[] = [];
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: SERPER_OK });
    const withUsage = paidSearchFromEnvWithUsage(usage, fetch);
    await withUsage.page(req, ctx(events));
    expect(events).toEqual(['request']);
    expect([...usage.rows.entries()]).toEqual([[`brave|${new Date().toISOString().slice(0, 7)}`, 1]]);
  });

  it('moves to the fallback past the primary budget and alerts naming the provider', async () => {
    const usage = memoryUsage();
    const month = new Date().toISOString().slice(0, 7);
    // $5 per 1,000 at a $1 budget: 160 requests is 80%, 200 is 100%.
    usage.rows.set(`brave|${month}`, 159);
    const alerts = memoryAlerts();
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: SERPER_OK });
    const c = paidSearchFromEnvWithUsage(usage, fetch, { BRAVE_MONTHLY_BUDGET_USD: 1, SERPER_MONTHLY_BUDGET_USD: 10 }, alerts);
    await c.page(req, ctx());
    expect(alerts.sent.map((a) => a.subject)).toEqual(['Brave Search spend at 80% of the $1 budget']);
    expect(alerts.sent[0]!.key).toBe(`web-search-budget:brave:${month}:80`);
    expect(alerts.sent[0]!.text).toMatch(/go to Serper instead/);

    usage.rows.set(`brave|${month}`, 200);
    const c2 = paidSearchFromEnvWithUsage(usage, fetch, { BRAVE_MONTHLY_BUDGET_USD: 1, SERPER_MONTHLY_BUDGET_USD: 10 }, alerts);
    expect((await c2.page({ ...req, page: 1 }, ctx())).companies[0]!.source).toBe('serper');
    expect(sources(fetch.calls)).toEqual(['brave', 'serper']);
    expect(usage.rows.get(`serper|${month}`)).toBe(1);
  });

  it('keeps the over budget provider answering when nothing else can', async () => {
    const usage = memoryUsage();
    const month = new Date().toISOString().slice(0, 7);
    usage.rows.set(`brave|${month}`, 10_000);
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: BRAVE_OK, [SERPER_ENDPOINT]: { status: 401, body: 'bad key' } });
    const c = paidSearchFromEnvWithUsage(usage, fetch, { BRAVE_MONTHLY_BUDGET_USD: 1 });
    expect((await c.page(req, ctx())).companies[0]!.source).toBe('brave');
    expect(sources(fetch.calls)).toEqual(['serper', 'brave']);
  });

  it('serves a cached page without asking either provider', async () => {
    const store = new Map<string, { companies: FoundCompany[]; more: boolean }>();
    const cache = { get: async (k: { q: string; page: number }) => store.get(`${k.q}|${k.page}`) ?? null, put: async (k: { q: string; page: number }, p: { companies: FoundCompany[]; more: boolean }) => void store.set(`${k.q}|${k.page}`, p) };
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { status: 402 }, [SERPER_ENDPOINT]: SERPER_OK });
    const c = paidSearchFromEnv(BOTH, { fetch, cache });
    await c.page(req, ctx());
    const events: string[] = [];
    await c.page(req, ctx(events));
    expect(events).toEqual(['cache_hit']);
    expect(sources(fetch.calls)).toEqual(['brave', 'serper']);
  });
});

/** paidSearchFromEnv with an in-memory usage store. */
function paidSearchFromEnvWithUsage(usage: WebSearchUsage, fetch: ReturnType<typeof fakeFetch>, env: Partial<PaidSearchEnv> = {}, alert?: Alerter) {
  return paidSearchFromEnv({ ...BOTH, ...env }, { fetch, usage, alert });
}

describe('web search usage table', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });

  it('adds paid requests per provider and month', async () => {
    const usage = dbWebSearchUsage(db.sql);
    const oct = new Date('2026-10-20T12:00:00Z');
    const nov = new Date('2026-11-01T00:00:00Z');
    await usage.add('brave', 2, oct);
    await usage.add('brave', 3, oct);
    await usage.add('serper', 4, oct);
    await usage.add('brave', 1, nov);
    const month = (p: WebSearchProviderName, d: Date) => usage.month(p, d);
    expect(await month('brave', oct)).toBe(5);
    expect(await month('serper', oct)).toBe(4);
    expect(await month('brave', nov)).toBe(1);
    expect(await month('serper', nov)).toBe(0);
  });
});
