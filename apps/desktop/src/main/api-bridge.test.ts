import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../ipc/contract';
import { bridgeRequest, deletedSearchId, exportCsvToFile, isAllowedApiPath, safeCsvFileName } from './api-bridge';
import { AuthSession } from './auth/session';

const SEARCH_ID = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b';
const dir = mkdtempSync(join(tmpdir(), 'nvoke-bridge-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** An AuthSession signed in with a stored token, over a fake apps/server. */
async function signedIn(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const states: AuthState[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  let stored: string | null = 'nvk_dt_secret';
  const session = new AuthSession({
    apiUrl: 'http://api.test',
    siteUrl: 'http://site.test',
    deviceName: 'test',
    tokenStore: {
      load: async () => stored,
      save: async (t) => void (stored = t),
      clear: async () => void (stored = null),
    },
    openExternal: async () => {},
    onChange: (s) => states.push(s),
    fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.endsWith('/v1/me')) return Response.json({ error: 'skip' }, { status: 500 });
      return handler(url, init ?? {});
    }) as unknown as typeof fetch,
  });
  await session.init();
  calls.length = 0;
  return { session, states, calls, stored: () => stored };
}

describe('isAllowedApiPath', () => {
  it('accepts /v1/ paths with a query string', () => {
    expect(isAllowedApiPath('/v1/searches')).toBe(true);
    expect(isAllowedApiPath(`/v1/searches/${SEARCH_ID}/companies?q=a%20b&kind=generic`)).toBe(true);
  });

  it('refuses anything else', () => {
    for (const bad of [
      '/health',
      '/v1',
      'v1/searches',
      'http://evil.test/v1/x',
      '//evil.test/v1/x',
      '/v1/../health',
      '/v1/%2e%2e/health',
      '/v1/a%2fb',
      '/v1\\searches',
      '/v1/searches#x',
      '/v1/sea rches',
      '/v1/searches\n',
      42,
      null,
    ]) {
      expect(isAllowedApiPath(bad), String(bad)).toBe(false);
    }
  });
});

describe('bridgeRequest', () => {
  it('attaches the device token and returns the parsed body', async () => {
    const t = await signedIn(() => Response.json({ searches: [] }));
    const res = await bridgeRequest(t.session, 'GET', '/v1/searches');
    expect(res).toEqual({ ok: true, status: 200, data: { searches: [] } });
    expect(t.calls[0]!.url).toBe('http://api.test/v1/searches');
    expect(new Headers(t.calls[0]!.init.headers).get('authorization')).toBe('Bearer nvk_dt_secret');
  });

  it('sends JSON bodies and maps 204 to null', async () => {
    const t = await signedIn((_url, init) =>
      init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(JSON.parse(String(init.body)), { status: 201 }),
    );
    const created = await bridgeRequest(t.session, 'POST', '/v1/searches', { kind: 'local' });
    expect(created).toEqual({ ok: true, status: 201, data: { kind: 'local' } });
    expect(new Headers(t.calls[0]!.init.headers).get('content-type')).toBe('application/json');
    expect(await bridgeRequest(t.session, 'DELETE', `/v1/searches/${SEARCH_ID}`)).toEqual({ ok: true, status: 204, data: null });
  });

  it("passes the server's error code through", async () => {
    const t = await signedIn(() => Response.json({ error: 'quota_exceeded' }, { status: 403 }));
    expect(await bridgeRequest(t.session, 'POST', '/v1/searches', {})).toEqual({ ok: false, status: 403, error: 'quota_exceeded' });
  });

  it('passes a short detail code through and drops free text', async () => {
    const t = await signedIn(() => Response.json({ error: 'site_unreadable', detail: 'blocked' }, { status: 422 }));
    expect(await bridgeRequest(t.session, 'POST', '/v1/site-profile', { website: 'acme.dk' })).toEqual({
      ok: false,
      status: 422,
      error: 'site_unreadable',
      detail: 'blocked',
    });
    const u = await signedIn(() => Response.json({ error: 'invalid_request', detail: 'Expected string, got number' }, { status: 400 }));
    expect(await bridgeRequest(u.session, 'POST', '/v1/site-profile', {})).toEqual({ ok: false, status: 400, error: 'invalid_request' });
  });

  it('passes a model id through as the detail of ai_model_unknown', async () => {
    const t = await signedIn(() => Response.json({ error: 'ai_model_unknown', detail: 'claude-opus-5-5' }, { status: 400 }));
    expect(await bridgeRequest(t.session, 'POST', '/v1/ai-key', { bulkModel: 'claude-opus-5-5' })).toEqual({
      ok: false,
      status: 400,
      error: 'ai_model_unknown',
      detail: 'claude-opus-5-5',
    });
  });

  it('signs out on 401', async () => {
    const t = await signedIn(() => Response.json({ error: 'invalid token' }, { status: 401 }));
    const res = await bridgeRequest(t.session, 'GET', '/v1/searches');
    expect(res).toEqual({ ok: false, status: 401, error: 'invalid token' });
    expect(t.session.getState().status).toBe('signed-out');
    expect(t.states.at(-1)?.status).toBe('signed-out');
    expect(t.stored()).toBeNull();
  });

  it('never rejects: network failures and refused input are status 0', async () => {
    const t = await signedIn(() => {
      throw new TypeError('fetch failed');
    });
    expect(await bridgeRequest(t.session, 'GET', '/v1/searches')).toEqual({ ok: false, status: 0, error: 'network' });
    expect(await bridgeRequest(t.session, 'PUT', '/v1/searches')).toEqual({ ok: false, status: 0, error: 'invalid_method' });
    expect(await bridgeRequest(t.session, 'GET', '/health')).toEqual({ ok: false, status: 0, error: 'invalid_path' });
    expect(t.calls).toHaveLength(1);
  });
});

describe('exportCsvToFile', () => {
  it('streams the CSV to disk', async () => {
    const csv = 'company,email\r\nAcme,info@acme.com\r\n';
    const t = await signedIn((url) => {
      expect(url).toBe(`http://api.test/v1/searches/${SEARCH_ID}/export.csv`);
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    });
    const file = join(dir, 'out.csv');
    expect(await exportCsvToFile(t.session, SEARCH_ID, file)).toEqual({ saved: true, filePath: file });
    expect(readFileSync(file, 'utf8')).toBe(csv);
  });

  it('reports failures without writing a file', async () => {
    const t = await signedIn(() => Response.json({ error: 'not_found' }, { status: 404 }));
    const file = join(dir, 'missing.csv');
    expect(await exportCsvToFile(t.session, SEARCH_ID, file)).toEqual({ saved: false, error: 'That search is gone.' });
    expect(existsSync(file)).toBe(false);
    expect((await exportCsvToFile(t.session, '../etc', file)).saved).toBe(false);
  });
});

describe('safeCsvFileName', () => {
  it('keeps names usable on every OS', () => {
    expect(safeCsvFileName('dentists-austin.csv')).toBe('dentists-austin.csv');
    expect(safeCsvFileName('a/b:c')).toBe('a-b-c.csv');
    expect(safeCsvFileName('..')).toBe('nvoke-export.csv');
    expect(safeCsvFileName(undefined)).toBe('nvoke-export.csv');
  });
});

describe('deletedSearchId', () => {
  const ok = { ok: true, status: 204, data: null } as const;
  it('names the search a successful delete removed', () => {
    expect(deletedSearchId('DELETE', `/v1/searches/${SEARCH_ID}`, ok)).toBe(SEARCH_ID);
  });
  it('ignores failed deletes, other methods and other paths', () => {
    expect(deletedSearchId('DELETE', `/v1/searches/${SEARCH_ID}`, { ok: false, status: 404, error: 'not_found' })).toBeNull();
    expect(deletedSearchId('GET', `/v1/searches/${SEARCH_ID}`, ok)).toBeNull();
    expect(deletedSearchId('DELETE', `/v1/api-keys/${SEARCH_ID}`, ok)).toBeNull();
    expect(deletedSearchId('DELETE', `/v1/searches/${SEARCH_ID}/x`, ok)).toBeNull();
  });
});
