import { describe, expect, it } from 'vitest';
import type { Company, Search } from '@nvoke/shared';
import type { LocalChange } from '../../ipc/contract';
import type { ApiClient } from '../api-bridge';
import { LocalStore } from './store';
import { company, search } from './fixtures';
import { LeadSync, SYNC_STALE_MS } from './sync';

/** A tiny apps/server: searches and their companies, paged two at a time. */
function fakeServer() {
  const state = { searches: [] as Search[], companies: new Map<string, Company[]>(), offline: false, calls: [] as string[] };
  const client: ApiClient = {
    async api(path) {
      state.calls.push(path);
      if (state.offline) throw new TypeError('fetch failed');
      const url = new URL(path, 'http://x');
      if (url.pathname === '/v1/searches') return Response.json({ searches: state.searches });
      const id = url.pathname.split('/')[3]!;
      const list = state.companies.get(id);
      if (!list || !state.searches.some((s) => s.id === id)) return Response.json({ error: 'not_found' }, { status: 404 });
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const next = offset + 2 < list.length ? String(offset + 2) : null;
      return Response.json({ companies: list.slice(offset, offset + 2), nextCursor: next, total: list.length });
    },
  };
  return { state, client };
}

function setup() {
  const { state, client } = fakeServer();
  const store = new LocalStore(':memory:');
  const changes: LocalChange[] = [];
  let now = 1_000_000;
  const sync = new LeadSync({ client, store, onChange: (c) => changes.push(c), now: () => now });
  return { state, store, sync, changes, advance: (ms: number) => (now += ms) };
}

const three = [
  company(1, 'Alpha', [['info@alpha.dk', 'generic', 'valid']]),
  company(2, 'Beta', [['hello@beta.dk', 'generic', 'valid']]),
  company(3, 'Gamma', [['ceo@gamma.dk', 'personal', 'risky']]),
];

describe('LeadSync', () => {
  it('copies finished searches with every page of companies', async () => {
    const { state, store, sync, changes } = setup();
    state.searches = [search(1)];
    state.companies.set(search(1).id, three);
    sync.start();
    await sync.syncNow();
    expect(store.queryCompanies(search(1).id, {})!.companies.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sync.status()).toMatchObject({ online: true, syncing: false, searches: 1, companies: 3, emails: 3 });
    expect(changes.some((c) => c.searchIds.includes(search(1).id) && c.searchesChanged)).toBe(true);
    sync.wipe();
  });

  it('leaves running searches to the API and fetches them once they finish', async () => {
    const { state, store, sync } = setup();
    state.searches = [search(1, { status: 'running' })];
    state.companies.set(search(1).id, three);
    sync.start();
    await sync.syncNow();
    expect(state.calls.filter((p) => p.includes('/companies'))).toEqual([]);
    state.searches = [search(1)];
    await sync.syncNow();
    expect(store.queryCompanies(search(1).id, {})!.total).toBe(3);
    sync.wipe();
  });

  it('only refetches a search when it changed, was asked for or went stale', async () => {
    const { state, sync, advance } = setup();
    state.searches = [search(1)];
    state.companies.set(search(1).id, three);
    sync.start();
    await sync.syncNow();
    const fetches = (): number => state.calls.filter((p) => p.includes('/companies') && !p.includes('cursor')).length;
    expect(fetches()).toBe(1);
    await sync.syncNow();
    expect(fetches()).toBe(1);
    await sync.refresh(search(1).id);
    expect(fetches()).toBe(2);
    advance(SYNC_STALE_MS);
    await sync.syncNow();
    expect(fetches()).toBe(3);
    sync.wipe();
  });

  it('deletes what the API stops returning: a search, a company, an address', async () => {
    const { state, store, sync } = setup();
    state.searches = [search(1), search(2)];
    state.companies.set(search(1).id, three);
    state.companies.set(search(2).id, three);
    sync.start();
    await sync.syncNow();
    expect(store.counts().companies).toBe(6);

    // An opt-out removed an address, and retention removed the second search.
    state.companies.set(search(1).id, [three[0]!, { ...three[1]!, emails: [] }]);
    state.searches = [search(1)];
    await sync.refresh(search(1).id);
    expect(store.listSearches().map((s) => s.id)).toEqual([search(1).id]);
    expect(store.queryCompanies(search(1).id, { q: 'beta.dk' })!.companies[0]!.emails).toEqual([]);
    expect(store.queryCompanies(search(1).id, { q: 'gamma' })!.total).toBe(0);
    sync.wipe();
  });

  it('keeps the copy offline and says so', async () => {
    const { state, store, sync } = setup();
    state.searches = [search(1)];
    state.companies.set(search(1).id, three);
    sync.start();
    await sync.syncNow();
    state.offline = true;
    await sync.syncNow();
    expect(sync.status().online).toBe(false);
    expect(store.queryCompanies(search(1).id, { q: 'alpha' })!.total).toBe(1);
    sync.wipe();
  });

  it('wipe empties the store, and a pass in flight writes nothing after it', async () => {
    const { state, store, sync } = setup();
    state.searches = [search(1)];
    state.companies.set(search(1).id, three);
    sync.start();
    const pass = sync.syncNow();
    sync.wipe();
    await pass;
    expect(sync.status()).toMatchObject({ searches: 0, companies: 0, online: null });
    expect(store.listSearches()).toEqual([]);
  });

  it('drops a search deleted through the API at once', async () => {
    const { state, store, sync, changes } = setup();
    state.searches = [search(1)];
    state.companies.set(search(1).id, three);
    sync.start();
    await sync.syncNow();
    sync.deleted(search(1).id);
    expect(store.listSearches()).toEqual([]);
    expect(changes.at(-1)).toMatchObject({ searchIds: [search(1).id], searchesChanged: true });
    sync.wipe();
  });
});
