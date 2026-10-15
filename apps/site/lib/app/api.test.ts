import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createWebApi, describeError, isQuotaError } from './api';

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that records calls and answers from a queue. */
function fakeFetch(...answers: Response[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = answers.shift();
    if (!next) throw new Error('no answer queued');
    return next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const headers = (call: Call | undefined): Record<string, string> => (call?.init.headers ?? {}) as Record<string, string>;

describe('buildQuery', () => {
  it('drops empty values and encodes the rest', () => {
    expect(buildQuery({ q: 'a b', verification: undefined, kind: '', cursor: 'x/y' })).toBe('?q=a+b&cursor=x%2Fy');
    expect(buildQuery({})).toBe('');
  });
});

describe('createWebApi', () => {
  it('sends the Clerk session token as the bearer to the API base', async () => {
    const { fetch, calls } = fakeFetch(json({ searches: [] }));
    const api = createWebApi({ baseUrl: 'https://api.nvoke.run/', getToken: async () => 'jwt-1', fetch });
    await expect(api.listSearches()).resolves.toEqual([]);
    expect(calls[0]?.url).toBe('https://api.nvoke.run/v1/searches');
    expect(calls[0]?.init.method).toBe('GET');
    expect(headers(calls[0])['Authorization']).toBe('Bearer jwt-1');
    expect(headers(calls[0])['Content-Type']).toBeUndefined();
  });

  it('asks for a fresh token on every call', async () => {
    const { fetch, calls } = fakeFetch(json({ searches: [] }), json({ searches: [] }));
    let n = 0;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => `jwt-${++n}`, fetch });
    await api.listSearches();
    await api.listSearches();
    expect(calls.map((c) => headers(c)['Authorization'])).toEqual(['Bearer jwt-1', 'Bearer jwt-2']);
  });

  it('posts a search as JSON', async () => {
    const { fetch, calls } = fakeFetch(json({ id: 's1' }, 201));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await api.createSearch({ kind: 'domains', params: { items: ['linear.app'] } });
    expect(calls[0]?.init.method).toBe('POST');
    expect(headers(calls[0])['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ kind: 'domains', params: { items: ['linear.app'] } });
  });

  it('deletes without a body and accepts an empty answer', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 204 }));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await expect(api.revokeApiKey('k/1')).resolves.toBeUndefined();
    expect(calls[0]?.url).toBe('https://api/v1/api-keys/k%2F1');
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('pages companies with the filters in the query', async () => {
    const page = { companies: [], nextCursor: null, total: 0 };
    const { fetch, calls } = fakeFetch(json(page));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await expect(api.listCompanies('s1', { verification: 'valid', kind: 'generic', cursor: 'c2' })).resolves.toEqual(page);
    expect(calls[0]?.url).toBe('https://api/v1/searches/s1/companies?verification=valid&kind=generic&cursor=c2');
  });

  it('exports the CSV with the same filters, as a file', async () => {
    const { fetch, calls } = fakeFetch(new Response('company,domain\r\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const blob = await api.exportCsv('s1', { q: 'acme' });
    expect(await blob.text()).toBe('company,domain\r\n');
    expect(calls[0]?.url).toBe('https://api/v1/searches/s1/export.csv?q=acme');
  });

  it('reads the plan with ?sync=1 only when asked', async () => {
    const { fetch, calls } = fakeFetch(json({}), json({}));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await api.getMe();
    await api.getMe(true);
    expect(calls.map((c) => c.url)).toEqual(['https://api/v1/me', 'https://api/v1/me?sync=1']);
  });

  it('turns a quota refusal into an ApiError that carries the billing URL', async () => {
    const { fetch } = fakeFetch(json({ error: 'quota_exceeded', billingUrl: 'https://nvoke.run/desktop/billing' }, 403));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const error = await api.createSearch({ kind: 'web', params: { keyword: 'cms' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isQuotaError(error)).toBe(true);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).billingUrl).toBe('https://nvoke.run/desktop/billing');
    expect((error as ApiError).message).toMatch(/out of verified emails/);
  });

  it('reports a network failure as status 0', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const error = (await api.getSearch('s1').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/Can’t reach nvoke/);
  });

  it('never calls the API without a session', async () => {
    const { fetch, calls } = fakeFetch();
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => null, fetch });
    const error = (await api.listSearches().catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('keeps an error page that is not JSON as a plain status', async () => {
    const { fetch } = fakeFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const error = (await api.listSearches().catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('');
    expect(error.message).toMatch(/server broke/);
  });
});

describe('describeError', () => {
  it('says what to do for the codes a user can hit', () => {
    expect(describeError(404, 'not_found')).toBe('That search is gone.');
    expect(describeError(401, 'unauthorized')).toMatch(/Sign in again/);
    expect(describeError(503, 'source_unavailable')).toMatch(/Web search is paused/);
    expect(describeError(409, 'api_key_limit')).toMatch(/20 keys/);
  });
});
