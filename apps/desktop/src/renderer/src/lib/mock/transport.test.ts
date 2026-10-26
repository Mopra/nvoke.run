import { describe, expect, it } from 'vitest';
import { ApiError, createApi } from '../api';
import { createMockTransport } from './transport';

function setup(seed = false) {
  let clock = Date.UTC(2026, 9, 13, 12, 0, 0);
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const transport = createMockTransport({ now: () => clock, latency: 0, seed, storage });
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

  it('runs a described customer search with stage notes, people and an ongoing switch', async () => {
    const { api, advance } = setup();
    const created = await api.createSearch({ kind: 'icp', params: { description: 'B2B SaaS startups hiring sales reps' }, limit: 100 });
    expect(created).toMatchObject({ kind: 'icp', status: 'queued', ongoing: false, stageNote: expect.any(String) });

    advance(20_000);
    const mid = await api.getSearch(created.id);
    expect(mid.status).toBe('running');
    expect(mid.stageNote).toBeTruthy();

    const on = await api.updateSearch(created.id, { ongoing: true });
    expect(on.ongoing).toBe(true);

    advance(600_000);
    const done = await api.getSearch(created.id);
    expect(done).toMatchObject({ status: 'done', ongoing: true, stageNote: null });
    const { companies } = await api.listCompanies(created.id, {}, true);
    const people = companies.flatMap((c) => c.emails).filter((e) => e.person);
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]).toMatchObject({ foundVia: expect.any(String), confidence: expect.any(Number) });
    expect(companies.every((c) => typeof c.fit === 'number')).toBe(true);

    const dm = await api.listCompanies(created.id, { decisionMakers: true }, true);
    expect(dm.companies.length).toBeGreaterThan(0);
    expect(dm.companies.every((c) => c.emails.every((e) => ['founder', 'executive', 'director'].includes(e.person?.seniority ?? '')))).toBe(true);
  });

  it('switches only plain words searches to ongoing', async () => {
    const { api } = setup();
    const s = await api.createSearch({ kind: 'web', params: { keyword: 'cms' } });
    await expect(api.updateSearch(s.id, { ongoing: true })).rejects.toMatchObject({ code: 'not_ongoing' });
  });

  it('hides shared inboxes until the search checks them, then settles them', async () => {
    const { api, advance } = setup();
    const s = await api.createSearch({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 60 });
    expect(s.checkInboxes).toBe(false);
    advance(600_000);
    const inboxes = async (): Promise<{ verification: string | null }[]> =>
      (await api.listCompanies(s.id, {}, true)).companies.flatMap((c) => c.emails).filter((e) => e.kind === 'generic' && !e.person);
    expect(await inboxes()).toEqual([]);

    const off = await api.getSearch(s.id);
    expect(off.inboxesSkipped).toBeGreaterThan(0);

    // Switched on, they wait hidden and counted, then settle.
    const on = await api.updateSearch(s.id, { checkInboxes: true });
    expect(on).toMatchObject({ checkInboxes: true, inboxesSkipped: 0 });
    expect(on.inboxesPending).toBeGreaterThan(0);
    expect(await inboxes()).toEqual([]);
    advance(10_000);
    expect((await api.getSearch(s.id)).inboxesPending).toBe(0);
    const settled = await inboxes();
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((e) => e.verification !== null)).toBe(true);

    const upFront = await api.createSearch({ kind: 'web', params: { keyword: 'cms' }, checkInboxes: true });
    expect(upFront.checkInboxes).toBe(true);
  });

  it('moves a search from queued through running to done', async () => {
    const { api, advance } = setup();
    const created = await api.createSearch({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 40 });
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

  it('runs an ended search again on top of what it holds', async () => {
    const { api, advance } = setup();
    const s = await api.createSearch({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 20 });
    await expect(api.searchMore(s.id, { kind: 'local', params: { niche: 'dentists', location: 'Denver' }, limit: 30 })).rejects.toMatchObject({
      code: 'search_running',
    });
    advance(120_000);
    const first = await api.getSearch(s.id);
    expect(first.status).toBe('done');

    await expect(api.searchMore(s.id, { kind: 'web', params: { keyword: 'dentists' } })).rejects.toMatchObject({ code: 'kind_mismatch' });
    const again = await api.searchMore(s.id, { kind: 'local', params: { niche: 'dentists', location: 'Denver' }, limit: 30 });
    expect(again).toMatchObject({ status: 'queued', companiesFound: first.companiesFound, limit: first.companiesFound + 30 });
    expect(again.params).toEqual({ niche: 'dentists', location: 'Denver' });
    expect(again.kind !== 'drop' && again.runs?.map((r) => r.foundBefore)).toEqual([0, first.companiesFound]);

    advance(120_000);
    const done = await api.getSearch(s.id);
    expect(done.status).toBe('done');
    expect(done.companiesFound).toBeGreaterThan(first.companiesFound);
    const page = await api.listCompanies(s.id, {}, true);
    expect(page.total).toBe(done.companiesFound);
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

    // `live` reads the API, not the local copy.
    const first = await api.listCompanies(s.id, {}, true);
    expect(first.companies).toHaveLength(100);
    expect(first.nextCursor).toBe('100');
    const second = await api.listCompanies(s.id, { cursor: first.nextCursor! }, true);
    expect(second.companies[0]!.id).not.toBe(first.companies[0]!.id);

    const valid = await api.listCompanies(s.id, { verification: 'valid', kind: 'personal' });
    expect(valid.total).toBeGreaterThan(0);
    for (const c of valid.companies) {
      expect(c.emails.length).toBeGreaterThan(0);
      for (const e of c.emails) {
        expect(e.verification).toBe('valid');
        expect(e.kind).toBe('personal');
      }
    }

    const target = first.companies[3]!;
    const byText = await api.listCompanies(s.id, { q: target.domain });
    expect(byText.companies.map((c) => c.id)).toContain(target.id);
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
    const s = await api.createSearch({ kind: 'launches', params: { days: 7 } });
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
    expect(states).toEqual(['signed-out', 'pending', 'signed-in']);
    expect((await api.getMe()).plan).toBe('emails_2500');
  });
});

describe('local copy', () => {
  function offlineSetup() {
    const clock = Date.UTC(2026, 9, 13, 12, 0, 0);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const api = createApi(createMockTransport({ now: () => clock, latency: 0, seed: true, storage }));
    return { api, goOffline: () => storage.setItem('nvoke.mock.offline', '1') };
  }

  it('reads a finished search from the local copy, paging with local cursors', async () => {
    const { api } = offlineSetup();
    const done = (await api.listSearches()).find((s) => s.status === 'done' && s.companiesFound > 100)!;
    const first = await api.listCompanies(done.id);
    expect(first.nextCursor).toMatch(/^local:\d+$/);
    const second = await api.listCompanies(done.id, { cursor: first.nextCursor! });
    expect(second.companies[0]!.id).not.toBe(first.companies[0]!.id);
  });

  it('falls back to the local copy when the network is down', async () => {
    const { api, goOffline } = offlineSetup();
    const online = await api.listSearches();
    goOffline();
    expect((await api.listSearches()).map((s) => s.id)).toEqual(online.map((s) => s.id));
    expect((await api.localStatus()).online).toBe(false);
    await expect(api.getMe()).rejects.toMatchObject({ status: 0 });
  });
  it('builds, reads and edits the site profile', async () => {
    const { api } = setup();
    expect(await api.getSiteProfile()).toBeNull();
    const built = await api.buildSiteProfile('https://www.acme-clinics.co.uk/about');
    expect(built.domain).toBe('acme-clinics.co.uk');
    expect(built.profile.name).toBe('Acme Clinics');
    expect(built.profile.country).toBe('gb');
    expect(built.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(new Set(built.suggestions.map((s) => s.search.kind)).size).toBeGreaterThanOrEqual(3);
    for (const s of built.suggestions) await expect(api.createSearch(s.search)).resolves.toMatchObject({ kind: s.search.kind });
    expect(await api.getSiteProfile()).toEqual(built);
    const edited = await api.updateSiteProfile({ audience: 'Clinics in Denver', country: null });
    expect(edited.profile).toMatchObject({ audience: 'Clinics in Denver', country: null, name: 'Acme Clinics' });
    expect(edited.suggestions).toEqual(built.suggestions);
  });

  it('answers an unreadable site with its reason', async () => {
    const { api } = setup();
    const err = await api.buildSiteProfile('nowhere.invalid').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'site_unreadable', detail: 'unreachable' });
    await expect(api.updateSiteProfile({ name: 'X' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('openers', () => {
  async function finished() {
    const { api, advance } = setup();
    const s = await api.createSearch({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 60 });
    advance(10 * 60_000);
    const companies = (await api.listCompanies(s.id, {}, true)).companies;
    return { api, advance, id: s.id, companies };
  }
  const valid = (c: { emails: { verification: string | null }[] }): boolean => c.emails.some((e) => e.verification === 'valid');

  it('starts with no openers', async () => {
    const { companies } = await finished();
    expect(companies.every((c) => c.opener === null)).toBe(true);
  });

  it('queues companies with a valid email, then drafts them', async () => {
    const { api, advance, id, companies } = await finished();
    const eligible = companies.filter(valid).length;
    expect(eligible).toBeGreaterThan(0);
    const res = await api.draftOpeners(id);
    expect(res).toEqual({ queued: eligible, skipped: companies.length - eligible });

    const queued = (await api.listCompanies(id, {}, true)).companies;
    for (const c of queued) expect(c.opener?.status ?? null).toBe(valid(c) ? 'queued' : null);

    advance(10_000);
    const drafted = (await api.listCompanies(id)).companies.filter((c) => c.opener);
    expect(drafted).toHaveLength(eligible);
    const done = drafted.filter((c) => c.opener!.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const c of done) {
      expect(c.opener!.line).toBeTruthy();
      expect(c.opener!.quote).toBeTruthy();
      expect(c.opener!.sourceUrl!.startsWith(c.website.replace(/\/$/, ''))).toBe(true);
    }
    for (const c of drafted.filter((d) => d.opener!.status === 'none')) expect(c.opener!.line).toBeNull();
  });

  it('skips what is drafted unless asked to redo, and drafts a chosen few', async () => {
    const { api, advance, id, companies } = await finished();
    const picked = companies.filter(valid).slice(0, 2);
    expect(await api.draftOpeners(id, { companyIds: [...picked.map((c) => c.id), companies.find((c) => !valid(c))!.id] })).toEqual({
      queued: 2,
      skipped: 1,
    });
    advance(10_000);
    const ids = picked.map((c) => c.id);
    const done = (await api.listCompanies(id)).companies.filter((c) => ids.includes(c.id) && c.opener?.status === 'done');
    if (done.length > 0) {
      expect(await api.draftOpeners(id, { companyIds: done.map((c) => c.id) })).toEqual({ queued: 0, skipped: done.length });
      expect(await api.draftOpeners(id, { companyIds: done.map((c) => c.id), redo: true })).toEqual({ queued: done.length, skipped: 0 });
    }
    await expect(api.draftOpeners(id, { companyIds: [] })).rejects.toMatchObject({ status: 400 });
  });

  it('keeps your own Claude key: none, saved, models only, removed', async () => {
    const { api } = setup();
    expect(await api.getAiKey()).toBeNull();
    await expect(api.saveAiKey({ bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-sonnet-5-5' })).rejects.toMatchObject({ status: 404 });
    await expect(api.saveAiKey({ apiKey: 'not-a-claude-key-at-all-1234' })).rejects.toMatchObject({ code: 'ai_key_rejected' });
    await expect(
      api.saveAiKey({ apiKey: 'sk-ant-api03-abcdefghijklmnop-WXYZ', bulkModel: 'claude-nonsense-1' }),
    ).rejects.toMatchObject({ code: 'ai_model_unknown', detail: 'claude-nonsense-1' });

    const saved = await api.saveAiKey({ apiKey: 'sk-ant-api03-abcdefghijklmnop-WXYZ', bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-sonnet-5-5' });
    expect(saved).toMatchObject({ provider: 'anthropic', last4: 'WXYZ', bulkModel: 'claude-haiku-5-5' });
    const models = await api.saveAiKey({ bulkModel: 'claude-sonnet-5-5', qualityModel: 'claude-opus-5-5' });
    expect(models).toMatchObject({ last4: 'WXYZ', bulkModel: 'claude-sonnet-5-5', qualityModel: 'claude-opus-5-5' });
    expect(await api.getAiKey()).toMatchObject({ qualityModel: 'claude-opus-5-5' });

    await api.deleteAiKey();
    expect(await api.getAiKey()).toBeNull();
  });

  it('keeps your own search key: none, refused, saved, replaced, removed', async () => {
    const { api } = setup();
    expect(await api.getSearchKey()).toBeNull();
    await expect(api.saveSearchKey({ provider: 'serper', apiKey: 'short' })).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(api.saveSearchKey({ provider: 'serper', apiKey: 'bad-serper-key-0000000' })).rejects.toMatchObject({ code: 'search_key_rejected' });

    expect(await api.saveSearchKey({ provider: 'serper', apiKey: 'serper-key-abcdefgh-WXYZ' })).toMatchObject({ provider: 'serper', last4: 'WXYZ' });
    await api.saveSearchKey({ provider: 'brave', apiKey: 'brave-key-abcdefghijk-QRST' });
    expect(await api.getSearchKey()).toMatchObject({ provider: 'brave', last4: 'QRST' });

    await api.deleteSearchKey();
    expect(await api.getSearchKey()).toBeNull();
  });
});
