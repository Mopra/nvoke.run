import { describe, expect, it } from 'vitest';
import { fakeFetch, silentLog } from '../../testing/fakes.js';
import type { CachedWebPage, WebSearchCache } from '../web-cache.js';
import { domainsAdapter, nameFromDomain, nameMatch, nameTokens, pickWebsite } from './domains.js';
import { PermanentError, SourceUnavailableError, type FoundCompany } from './types.js';
import { BRAVE_ENDPOINT, braveClient } from './web.js';

/** Brave answers each query with the result URLs given for it. */
function brave(results: Record<string, string[]>) {
  return fakeFetch({
    [BRAVE_ENDPOINT]: (url) => {
      const urls = results[url.searchParams.get('q') ?? ''] ?? [];
      return { body: JSON.stringify({ web: { results: urls.map((u) => ({ url: u, title: u })) } }) };
    },
  });
}

async function run(params: { items: string[]; country?: string }, opts: { apiKey?: string; fetch?: ReturnType<typeof brave>; cache?: WebSearchCache } = {}) {
  const client = braveClient({ apiKey: 'apiKey' in opts ? opts.apiKey : 'k', fetch: opts.fetch ?? brave({}), cache: opts.cache, requestsPerSecond: 1_000 });
  const events: string[] = [];
  const out: FoundCompany[] = [];
  const ctx = { limit: 1000, signal: new AbortController().signal, log: silentLog, onUsage: (e: string) => void events.push(e) };
  for await (const c of domainsAdapter(client).find(params, ctx)) out.push(c);
  return { out, events };
}

describe('domains adapter', () => {
  it('yields domains first, at no cost, then looks up names', async () => {
    const fetch = brave({ Pleo: ['https://www.linkedin.com/company/pleo', 'https://www.pleo.io/en/', 'https://pleo.dk'] });
    const { out, events } = await run({ items: ['Pleo', 'https://www.linear.app/about', 'jane@raycast.com', 'acme-dental.dk'] }, { fetch });
    expect(out).toEqual([
      { name: 'Linear', website: 'https://linear.app/', source: 'list', sourceRef: 'https://www.linear.app/about' },
      { name: 'Raycast', website: 'https://raycast.com/', source: 'list', sourceRef: 'jane@raycast.com' },
      { name: 'Acme Dental', website: 'https://acme-dental.dk/', source: 'list', sourceRef: 'acme-dental.dk' },
      { name: 'Pleo', website: 'https://www.pleo.io', source: 'brave', sourceRef: 'https://www.pleo.io/en/' },
    ]);
    expect(events).toEqual(['request']);
    expect(fetch.calls).toHaveLength(1);
  });

  it('skips webmail addresses and names nothing usable was found for', async () => {
    const fetch = brave({ Ghost: ['https://www.facebook.com/ghost', 'https://en.wikipedia.org/wiki/Ghost'] });
    const { out } = await run({ items: ['someone@gmail.com', 'Ghost'] }, { fetch });
    expect(out).toEqual([]);
  });

  it('scopes name lookups to the country and reuses cached pages', async () => {
    const store = new Map<string, CachedWebPage>();
    const cache: WebSearchCache = {
      get: async (key) => store.get(`${key.q}|${key.country ?? ''}|${key.page}`) ?? null,
      put: async (key, page) => void store.set(`${key.q}|${key.country ?? ''}|${key.page}`, page),
    };
    const fetch = brave({ Lunar: ['https://www.lunar.app/dk/'] });
    const first = await run({ items: ['Lunar'], country: 'dk' }, { fetch, cache });
    expect(new URL(fetch.calls[0]!.url).searchParams.get('country')).toBe('dk');
    const second = await run({ items: ['Lunar'], country: 'dk' }, { fetch, cache });
    expect(second.out).toEqual(first.out);
    expect(second.events).toEqual(['cache_hit']);
    expect(fetch.calls).toHaveLength(1);
  });

  it('keeps the domains when web search is not configured, and fails a list of only names', async () => {
    const { out } = await run({ items: ['acme.com', 'Pleo'] }, { apiKey: undefined });
    expect(out.map((c) => c.website)).toEqual(['https://acme.com/']);
    await expect(run({ items: ['Pleo'] }, { apiKey: undefined })).rejects.toBeInstanceOf(PermanentError);
  });

  it('passes a Brave refusal on after the domains', async () => {
    const fetch = fakeFetch({ [BRAVE_ENDPOINT]: { status: 402, body: 'payment required' } });
    const client = braveClient({ apiKey: 'k', fetch, requestsPerSecond: 1_000 });
    const seen: string[] = [];
    const ctx = { limit: 10, signal: new AbortController().signal, log: silentLog };
    const err = await (async () => {
      for await (const c of domainsAdapter(client).find({ items: ['acme.com', 'Pleo'] }, ctx)) seen.push(c.website);
    })().catch((e: unknown) => e);
    expect(seen).toEqual(['https://acme.com/']);
    expect(err).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('picking a website for a name', () => {
  it('folds legal words and Nordic letters', () => {
    expect(nameTokens('Mærsk A/S')).toEqual(['maersk']);
    expect(nameTokens('The Novo Nordisk Group')).toEqual(['novo', 'nordisk']);
    expect(nameTokens('Café Øresund ApS')).toEqual(['cafe', 'oeresund']);
  });

  it('scores how much a domain looks like the name', () => {
    expect(nameMatch('Novo Nordisk', 'novonordisk.com')).toBe(3);
    expect(nameMatch('Søstrene Grene', 'sostrenegrene.com')).toBe(3);
    expect(nameMatch('Too Good To Go', 'toogoodtogo.dk')).toBe(3);
    expect(nameMatch('Pleo', 'getpleo.io')).toBe(2);
    expect(nameMatch('Acme Dental Clinic', 'acmedental.dk')).toBe(2);
    expect(nameMatch('Lunar Bank', 'lunar.app')).toBe(2);
    expect(nameMatch('Pleo', 'spendesk.com')).toBe(0);
  });

  it('prefers a matching domain and falls back to the top results only', () => {
    const r = (url: string): FoundCompany => ({ name: url, website: new URL(url).origin, source: 'brave', sourceRef: url });
    expect(pickWebsite('Novo Nordisk', [r('https://www.reuters.com/x'), r('https://www.novonordisk.com/')])?.website).toBe('https://www.novonordisk.com');
    expect(pickWebsite('Obscure Co', [r('https://www.youtube.com/x'), r('https://first-hit.dk/')])?.website).toBe('https://first-hit.dk');
    expect(pickWebsite('Obscure Co', ['a', 'b', 'c', 'd'].map((x) => r(`https://www.facebook.com/${x}`)).concat(r('https://late.dk/')))).toBeNull();
  });

  it('names a company after its domain', () => {
    expect(nameFromDomain('acme-dental.co.uk')).toBe('Acme Dental');
    expect(nameFromDomain('shop.linear.app')).toBe('Linear');
  });
});
