import { describe, expect, it } from 'vitest';
import { ApiError, createApi } from '../api';
import { createMockTransport } from './transport';

function setup(seed = false) {
  let clock = Date.UTC(2026, 9, 13, 12, 0, 0);
  const transport = createMockTransport({ now: () => clock, latency: 0, seed });
  return {
    api: createApi(transport),
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('mock transport', () => {
  it('seeds a mix of searches, newest first', async () => {
    const { api } = setup(true);
    const list = await api.listSearches();
    expect(list.length).toBeGreaterThanOrEqual(4);
    const times = list.map((s) => Date.parse(s.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(list.map((s) => s.status)).toEqual(expect.arrayContaining(['done', 'failed', 'canceled']));
  });

  it('moves a search from queued through running to done', async () => {
    const { api, advance } = setup();
    const created = await api.createSearch({ kind: 'local', params: { niche: 'dentists', location: 'Copenhagen' }, limit: 40 });
    expect(created.status).toBe('queued');
    expect(created.companiesFound).toBe(0);

    advance(5000);
    const mid = await api.getSearch(created.id);
    expect(mid.status).toBe('running');
    expect(mid.companiesFound).toBeGreaterThan(0);
    expect(mid.companiesCrawled).toBeLessThanOrEqual(mid.companiesFound);

    advance(120_000);
    const done = await api.getSearch(created.id);
    expect(done.status).toBe('done');
    expect(done.companiesCrawled).toBe(done.companiesFound);
    expect(done.companiesFound).toBeLessThanOrEqual(40);
    expect(done.emailsValid).toBeLessThanOrEqual(done.emailsFound);
    expect(done.finishedAt).not.toBeNull();
  });

  it('freezes counters when canceled', async () => {
    const { api, advance } = setup();
    const s = await api.createSearch({ kind: 'web', params: { keyword: 'cms' }, limit: 200 });
    advance(6000);
    const canceled = await api.cancelSearch(s.id);
    expect(canceled.status).toBe('canceled');
    advance(60_000);
    const later = await api.getSearch(s.id);
    expect(later.companiesFound).toBe(canceled.companiesFound);
  });

  it('filters companies by verification, kind and text, and paginates', async () => {
    const { api, advance } = setup();
    const s = await api.createSearch({ kind: 'web', params: { keyword: 'cms', country: 'DE' }, limit: 400 });
    advance(10 * 60_000);

    const first = await api.listCompanies(s.id);
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe('100');
    const second = await api.listCompanies(s.id, { cursor: first.nextCursor! });
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);

    const valid = await api.listCompanies(s.id, { verification: 'valid', kind: 'personal' });
    expect(valid.total).toBeGreaterThan(0);
    for (const c of valid.items) {
      expect(c.emails.length).toBeGreaterThan(0);
      for (const e of c.emails) {
        expect(e.verification).toBe('valid');
        expect(e.kind).toBe('personal');
      }
    }

    const target = first.items[3]!;
    const byText = await api.listCompanies(s.id, { q: target.domain });
    expect(byText.items.map((c) => c.id)).toContain(target.id);
  });

  it('rejects invalid input and unknown ids with ApiError', async () => {
    const { api } = setup();
    await expect(api.createSearch({ kind: 'local', params: { niche: '', location: 'x' } })).rejects.toMatchObject({
      status: 400,
    });
    const err = await api.getSearch('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('deletes a search', async () => {
    const { api } = setup();
    const s = await api.createSearch({ kind: 'launches', params: { window: 'week' } });
    await api.deleteSearch(s.id);
    expect(await api.listSearches()).toHaveLength(0);
  });

  it('signs out, answers 401, and signs back in', async () => {
    const { api } = setup();
    const states: string[] = [];
    api.onAuthChange((s) => states.push(s.status));
    expect((await api.getAuthState()).status).toBe('signed-in');
    await api.signOut();
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
    await api.signIn();
    await new Promise((r) => setTimeout(r, 5));
    expect(states).toEqual(['signed-out', 'signed-in']);
    expect((await api.getMe()).plan).toBe('pro');
  });
});
