import { describe, expect, it } from 'vitest';
import { ApiError, createWebApi } from './api';
import { providerLabel, saveSearchKeyBody, searchKeyErrorMessage, searchKeyStatus } from './search-key';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('searchKeyStatus', () => {
  it('says when searches run on nvoke’s key', () => {
    expect(searchKeyStatus(null)).toBe('Searching on nvoke’s key');
  });

  it('names the provider and the last 4', () => {
    expect(searchKeyStatus({ provider: 'serper', last4: 'a1b2', updatedAt: '2026-10-26T00:00:00Z' })).toBe('Serper key ending in a1b2');
    expect(searchKeyStatus({ provider: 'brave', last4: 'z9y8', updatedAt: '2026-10-26T00:00:00Z' })).toBe('Brave Search key ending in z9y8');
  });
});

describe('saveSearchKeyBody', () => {
  it('sends the provider with a trimmed key', () => {
    expect(saveSearchKeyBody({ provider: 'brave', apiKey: '  BSAabcdefghijklmnop  ' })).toEqual({ provider: 'brave', apiKey: 'BSAabcdefghijklmnop' });
  });
});

describe('searchKeyErrorMessage', () => {
  it('passes on what the engine said about a refused key', () => {
    expect(searchKeyErrorMessage(new ApiError(400, 'search_key_rejected', null, 'Unauthorized'), 'serper')).toBe('Serper refused that key: Unauthorized');
    expect(searchKeyErrorMessage(new ApiError(400, 'search_key_rejected'), 'brave')).toMatch(/^Brave Search refused that key\./);
  });

  it('asks to try again when the key cannot be checked now', () => {
    expect(searchKeyErrorMessage(new ApiError(503, 'source_unavailable'), 'serper')).toMatch(/Try again in a minute/);
  });

  it('falls back to the general wording', () => {
    expect(searchKeyErrorMessage(new ApiError(0, 'network'), 'serper')).toMatch(/Can’t reach nvoke/);
  });
});

describe('providerLabel', () => {
  it('names each provider', () => {
    expect(providerLabel('serper')).toBe('Serper');
    expect(providerLabel('brave')).toBe('Brave Search');
  });
});

describe('search key api', () => {
  it('reads no key as null and keeps other errors', async () => {
    const answers = [json({ error: 'not_found' }, 404), json({ error: 'internal' }, 500)];
    const fetch = (async () => answers.shift() as Response) as unknown as typeof globalThis.fetch;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    await expect(api.getSearchKey()).resolves.toBeNull();
    await expect(api.getSearchKey()).rejects.toBeInstanceOf(ApiError);
  });

  it('posts the save and keeps what the engine said in detail', async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return json({ error: 'search_key_rejected', detail: 'Unauthorized' }, 400);
    }) as unknown as typeof globalThis.fetch;
    const api = createWebApi({ baseUrl: 'https://api', getToken: async () => 't', fetch });
    const error = (await api.saveSearchKey({ provider: 'serper', apiKey: 'abcdefghijklmnopqrst' }).catch((e: unknown) => e)) as ApiError;
    expect(sent[0]?.url).toBe('https://api/v1/search-key');
    expect(sent[0]?.init.method).toBe('POST');
    expect(error.code).toBe('search_key_rejected');
    expect(error.detail).toBe('Unauthorized');
  });
});
