import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompaniesPage, DraftOpenersResponse, MeResponse, Search, SearchListResponse } from '@nvoke/shared';
import type { Ai } from '../../ai/client.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { loadEnv } from '../../env.js';
import { memoryStore } from '../../auth/store.js';
import { buildApp } from '../app.js';
import { leadsRoutes } from './leads.js';

let db: TestDb;
let app: FastifyInstance;
/** Whether the fake Claude says it would answer. */
let aiReady = true;
const ai: Ai = {
  ready: async () => aiReady,
  structured: async () => {
    throw new Error('the route never calls Claude');
  },
};

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(leadsRoutes, {
    prefix: '/v1',
    getSql: () => db.sql,
    billingUrl: 'https://nvoke.test/desktop/billing',
    getAi: () => ai,
    // Stands in for the real auth preHandler.
    authenticate: async (req) => {
      const user = req.headers['x-test-user'];
      if (typeof user === 'string') req.userId = user;
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts, jobs, source_pauses cascade`;
  aiReady = true;
});

const as = (user: string) => ({ 'x-test-user': user });

async function createSearch(
  user = 'alice',
  body: object = { kind: 'local', params: { niche: 'dentists', location: 'Copenhagen' } },
): Promise<LightMyRequestResponse> {
  const res = await app.inject({ method: 'POST', url: '/v1/searches', headers: as(user), payload: body });
  return res;
}

/** Inserts a company with emails straight into the database. */
async function seedCompany(searchId: string, user: string, name: string, domain: string, emails: Array<[string, 'generic' | 'personal', string | null]>) {
  const [c] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, location, phone)
    values (${searchId}, ${user}, ${name}, ${domain}, ${`https://${domain}/`}, 'test', 'Vej 1, København', '+45 12 34 56 78')
    returning id`;
  for (const [address, kind, verification] of emails) {
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, source_url, verification)
      values (${c!.id}, ${searchId}, ${user}, ${address}, ${kind}, ${`https://${domain}/kontakt`}, ${verification})`;
  }
  return c!.id;
}

describe('lead routes', () => {
  it('401s without a user', async () => {
    for (const [method, url] of [
      ['GET', '/v1/searches'],
      ['POST', '/v1/searches'],
      ['GET', '/v1/searches/00000000-0000-0000-0000-000000000000/export.csv'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('creates a search with a find job', async () => {
    const res = await createSearch('alice', { kind: 'web', params: { keyword: 'design studio', country: 'DK' }, limit: 1000 });
    expect(res.statusCode).toBe(201);
    const search = Search.parse(res.json());
    expect(search).toMatchObject({ kind: 'web', params: { keyword: 'design studio', country: 'dk' }, status: 'queued', limit: 1000 });
    const jobs = await db.sql`select type, payload from jobs where search_id = ${search.id}`;
    expect(jobs).toEqual([{ type: 'find', payload: { searchId: search.id } }]);
    const [account] = await db.sql`select plan from accounts where clerk_user_id = 'alice'`;
    expect(account).toEqual({ plan: 'free' });
  });

  it('uses the default limit of 100', async () => {
    await db.sql`insert into accounts (clerk_user_id, plan) values ('bob', 'emails_2500')`;
    const res = await createSearch('bob', { kind: 'launches', params: { days: 3 } });
    expect(Search.parse(res.json()).limit).toBe(100);
  });

  it('rejects invalid requests with the zod issues', async () => {
    for (const body of [{}, { kind: 'local', params: { niche: '' , location: 'x' } }, { kind: 'nope', params: {} }, { kind: 'launches', params: { days: 99 } }]) {
      const res = await createSearch('alice', body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_request');
    }
  });

  it('refuses web searches while Brave is paused, and nothing else', async () => {
    await db.sql`insert into source_pauses (source, reason, until) values ('brave', 'limit', now() + interval '5 minutes')`;
    const web = await createSearch('alice', { kind: 'web', params: { keyword: 'dentists' } });
    expect(web.statusCode).toBe(503);
    expect(web.json()).toEqual({ error: 'source_unavailable' });
    expect((await createSearch('alice')).statusCode).toBe(201);
    await db.sql`update source_pauses set until = now() - interval '1 second'`;
    expect((await createSearch('alice', { kind: 'web', params: { keyword: 'dentists' } })).statusCode).toBe(201);
  });

  it('sizes a domains search by its list, cut by a smaller limit', async () => {
    const items = ['acme.com', 'https://www.acme.com/contact', 'Pleo', 'linear.app'];
    const all = Search.parse((await createSearch('alice', { kind: 'domains', params: { items } })).json());
    expect(all).toMatchObject({ kind: 'domains', params: { items: ['acme.com', 'Pleo', 'linear.app'] }, limit: 3 });
    const cut = Search.parse((await createSearch('alice', { kind: 'domains', params: { items }, limit: 2 })).json());
    expect(cut).toMatchObject({ params: { items: ['acme.com', 'Pleo'] }, limit: 2 });
    expect((await createSearch('alice', { kind: 'domains', params: { items: [] } })).statusCode).toBe(400);
  });

  it('refuses a list with names while Brave is paused, but not a list of only domains', async () => {
    await db.sql`insert into source_pauses (source, reason, until) values ('brave', 'limit', now() + interval '5 minutes')`;
    const names = await createSearch('alice', { kind: 'domains', params: { items: ['acme.com', 'Pleo'] } });
    expect(names.statusCode).toBe(503);
    const domains = await createSearch('alice', { kind: 'domains', params: { items: ['acme.com', 'https://linear.app'] } });
    expect(domains.statusCode).toBe(201);
  });

  it('refuses new searches when the monthly quota is used up', async () => {
    await db.sql`insert into accounts (clerk_user_id) values ('carol')`;
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('carol', ${new Date().toISOString().slice(0, 7)}, 50)`;
    const res = await createSearch('carol');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'quota_exceeded', billingUrl: 'https://nvoke.test/desktop/billing' });
  });

  it("lists searches newest first and only the caller's", async () => {
    const a = Search.parse((await createSearch('alice')).json());
    const b = Search.parse((await createSearch('alice', { kind: 'launches', params: {} })).json());
    await createSearch('mallory');
    const res = await app.inject({ method: 'GET', url: '/v1/searches', headers: as('alice') });
    const list = SearchListResponse.parse(res.json());
    expect(list.searches.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it('gets one search, 404 for other users and bad ids', async () => {
    const a = Search.parse((await createSearch('alice')).json());
    expect((await app.inject({ method: 'GET', url: `/v1/searches/${a.id}`, headers: as('alice') })).json()).toEqual(a);
    expect((await app.inject({ method: 'GET', url: `/v1/searches/${a.id}`, headers: as('mallory') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/searches/not-a-uuid', headers: as('alice') })).statusCode).toBe(404);
  });

  it('cancels a running search once, and cancels its queued jobs', async () => {
    const a = Search.parse((await createSearch('alice')).json());
    const res = await app.inject({ method: 'POST', url: `/v1/searches/${a.id}/cancel`, headers: as('alice') });
    expect(res.statusCode).toBe(200);
    expect(Search.parse(res.json()).status).toBe('canceled');
    expect(await db.sql`select status from jobs where search_id = ${a.id}`).toEqual([{ status: 'canceled' }]);
    const again = await app.inject({ method: 'POST', url: `/v1/searches/${a.id}/cancel`, headers: as('alice') });
    expect(again.statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/v1/searches/${a.id}/cancel`, headers: as('mallory') })).statusCode).toBe(404);
  });

  it('runs a finished search again into the same list', async () => {
    const search = Search.parse((await createSearch('alice', { kind: 'local', params: { niche: 'dentists', location: 'Aarhus' }, limit: 20 })).json());
    if (search.kind !== 'local') throw new Error('expected a local search');
    expect(search.runs).toEqual([{ params: { niche: 'dentists', location: 'Aarhus' }, limit: 20, foundBefore: 0, createdAt: expect.any(String) }]);
    const more = (body: object) => app.inject({ method: 'POST', url: `/v1/searches/${search.id}/more`, headers: as('alice'), payload: body });
    const odense = { kind: 'local', params: { niche: 'dentists', location: 'Odense' }, limit: 50 };

    // Not while it runs.
    expect((await more(odense)).json()).toEqual({ error: 'search_running' });

    await seedCompany(search.id, 'alice', 'Tand A', 'tand-a.dk', []);
    await seedCompany(search.id, 'alice', 'Tand B', 'tand-b.dk', []);
    await db.sql`update searches set status = 'done', error = null, finished_at = now(), companies_found = 2 where id = ${search.id}`;
    await db.sql`delete from jobs where search_id = ${search.id}`;

    const res = await more(odense);
    expect(res.statusCode).toBe(200);
    const again = Search.parse(res.json());
    if (again.kind !== 'local') throw new Error('expected a local search');
    expect(again).toMatchObject({ id: search.id, status: 'queued', params: odense.params, limit: 52, companiesFound: 2, finishedAt: null });
    expect(again.runs?.map((r) => [r.params, r.limit, r.foundBefore])).toEqual([
      [{ niche: 'dentists', location: 'Aarhus' }, 20, 0],
      [odense.params, 50, 2],
    ]);
    const jobs = await db.sql`select type from jobs where search_id = ${search.id}`;
    expect(jobs).toEqual([{ type: 'find' }]);

    // Its own kind only, its owner only.
    await db.sql`update searches set status = 'canceled' where id = ${search.id}`;
    expect((await more({ kind: 'web', params: { keyword: 'dentists' } })).json()).toEqual({ error: 'kind_mismatch' });
    const other = await app.inject({ method: 'POST', url: `/v1/searches/${search.id}/more`, headers: as('mallory'), payload: odense });
    expect(other.statusCode).toBe(404);
  });

  it('deletes a search with its companies, emails and jobs', async () => {
    const a = Search.parse((await createSearch('alice')).json());
    await seedCompany(a.id, 'alice', 'Acme', 'acme.dk', [['info@acme.dk', 'generic', 'valid']]);
    expect((await app.inject({ method: 'DELETE', url: `/v1/searches/${a.id}`, headers: as('mallory') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/v1/searches/${a.id}`, headers: as('alice') })).statusCode).toBe(204);
    for (const table of ['searches', 'companies', 'emails', 'jobs']) {
      const [row] = await db.sql<{ n: number }[]>`select count(*)::int as n from ${db.sql(table)}`;
      expect(row?.n, table).toBe(0);
    }
  });

  describe('companies and export', () => {
    let searchId: string;

    beforeEach(async () => {
      searchId = Search.parse((await createSearch('alice')).json()).id;
      await seedCompany(searchId, 'alice', 'Acme Dental', 'acme.dk', [
        ['info@acme.dk', 'generic', 'valid'],
        ['ole@acme.dk', 'personal', 'invalid'],
      ]);
      await seedCompany(searchId, 'alice', 'Beta, "the" clinic', 'beta.dk', [['mette@beta.dk', 'personal', 'valid']]);
      await seedCompany(searchId, 'alice', 'Gamma', 'gamma.dk', [['unchecked@gamma.dk', 'generic', null]]); // never shown
      await seedCompany(searchId, 'alice', 'Delta', 'delta.dk', [['=cmd@delta.dk', 'personal', 'unknown']]);
    });

    const page = async (query: string) => {
      const res = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/companies${query}`, headers: as('alice') });
      expect(res.statusCode, res.body).toBe(200);
      return CompaniesPage.parse(res.json());
    };

    it('returns companies with their emails', async () => {
      const p = await page('');
      expect(p.companies.map((c) => c.name)).toEqual(['Acme Dental', 'Beta, "the" clinic', 'Gamma', 'Delta']);
      expect(p.companies[0]?.emails.map((e) => [e.address, e.kind, e.verification])).toEqual([
        ['info@acme.dk', 'generic', 'valid'],
        ['ole@acme.dk', 'personal', 'invalid'],
      ]);
      expect(p.companies[2]?.emails).toEqual([]);
      expect(p.nextCursor).toBeNull();
      expect(p.total).toBe(4);
    });

    it('paginates with a cursor', async () => {
      const first = await page('?limit=3');
      expect(first.companies).toHaveLength(3);
      expect(first.nextCursor).not.toBeNull();
      expect(first.total).toBe(4);
      const second = await page(`?limit=3&cursor=${first.nextCursor}`);
      expect(second.companies.map((c) => c.name)).toEqual(['Delta']);
      expect(second.nextCursor).toBeNull();
      expect(second.total).toBe(4);
      const bad = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/companies?cursor=garbage`, headers: as('alice') });
      expect(bad.statusCode).toBe(400);
    });

    it('filters by verification, kind and text', async () => {
      const valid = await page('?verification=valid');
      expect(valid.companies.map((c) => [c.name, c.emails.map((e) => e.address)])).toEqual([
        ['Acme Dental', ['info@acme.dk']],
        ['Beta, "the" clinic', ['mette@beta.dk']],
      ]);
      const personalValid = await page('?verification=valid&kind=personal');
      expect(valid.total).toBe(2);
      expect(personalValid.companies.map((c) => c.name)).toEqual(['Beta, "the" clinic']);
      expect(personalValid.total).toBe(1);
      expect((await page('?q=gamma')).companies.map((c) => c.name)).toEqual(['Gamma']);
      expect((await page('?q=OLE@')).companies.map((c) => c.name)).toEqual(['Acme Dental']);
      expect((await page('?q=100%25')).companies).toEqual([]);
      const bad = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/companies?verification=maybe`, headers: as('alice') });
      expect(bad.statusCode).toBe(400);
    });

    it('404s for another user', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/companies`, headers: as('mallory') });
      expect(res.statusCode).toBe(404);
    });

    it('exports one CSV row per email', async () => {
      await db.sql`
        update companies set opener_status = 'done', opener = 'Your clinic opened in Aarhus in 1998.', opener_at = now()
        where domain = 'acme.dk'
      `;
      // Only a done opener is exported.
      await db.sql`update companies set opener_status = 'queued', opener = 'stale' where domain = 'beta.dk'`;
      const res = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/export.csv`, headers: as('alice') });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="nvoke-[0-9a-f]{8}\.csv"$/);
      const lines = res.body.slice(res.body.charCodeAt(0) === 0xfeff ? 1 : 0).trimEnd().split('\r\n');
      expect(lines).toEqual([
        'company,domain,website,email,kind,verification,source_url,location,phone,opener',
        'Acme Dental,acme.dk,https://acme.dk/,info@acme.dk,generic,valid,https://acme.dk/kontakt,"Vej 1, København",+45 12 34 56 78,Your clinic opened in Aarhus in 1998.',
        'Acme Dental,acme.dk,https://acme.dk/,ole@acme.dk,personal,invalid,https://acme.dk/kontakt,"Vej 1, København",+45 12 34 56 78,Your clinic opened in Aarhus in 1998.',
        '"Beta, ""the"" clinic",beta.dk,https://beta.dk/,mette@beta.dk,personal,valid,https://beta.dk/kontakt,"Vej 1, København",+45 12 34 56 78,',
        "Delta,delta.dk,https://delta.dk/,'=cmd@delta.dk,personal,unknown,https://delta.dk/kontakt,\"Vej 1, København\",+45 12 34 56 78,",
      ]);
      const filtered = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/export.csv?verification=valid&kind=generic`, headers: as('alice') });
      expect(filtered.body.trimEnd().split('\r\n')).toHaveLength(2);
      const other = await app.inject({ method: 'GET', url: `/v1/searches/${searchId}/export.csv`, headers: as('mallory') });
      expect(other.statusCode).toBe(404);
    });

    const draft = (body: object, user = 'alice') =>
      app.inject({ method: 'POST', url: `/v1/searches/${searchId}/openers`, headers: as(user), payload: body });

    it('queues openers only for companies with a valid email, in batches', async () => {
      const res = await draft({});
      expect(res.statusCode, res.body).toBe(202);
      // Acme and Beta have a valid address; Gamma and Delta do not.
      expect(DraftOpenersResponse.parse(res.json())).toEqual({ queued: 2, skipped: 2 });
      const jobs = await db.sql<{ type: string; payload: { companyIds: string[] }; search_id: string | null }[]>`
        select type, payload, search_id from jobs where type = 'opener'
      `;
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.payload.companyIds).toHaveLength(2);
      expect(jobs[0]!.search_id).toBeNull();

      const p = await page('');
      expect(p.companies.map((c) => c.opener?.status ?? null)).toEqual(['queued', 'queued', null, null]);

      // Queued ones are left alone, even with redo.
      expect((await draft({ redo: true })).json()).toEqual({ queued: 0, skipped: 4 });
    });

    it('drafts again only with redo, and only the companies asked for', async () => {
      const acme = (await page('')).companies[0]!.id;
      await db.sql`update companies set opener_status = 'done', opener = 'x' where id = ${acme}`;
      expect((await draft({ companyIds: [acme] })).json()).toEqual({ queued: 0, skipped: 1 });
      expect((await draft({ companyIds: [acme], redo: true })).json()).toEqual({ queued: 1, skipped: 0 });
      // A failed one is drafted again without redo.
      await db.sql`update companies set opener_status = 'failed' where id = ${acme}`;
      expect((await draft({ companyIds: [acme] })).json()).toEqual({ queued: 1, skipped: 0 });
    });

    it('refuses when Claude would not answer, and other users', async () => {
      aiReady = false;
      const res = await draft({});
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'ai_unavailable' });
      aiReady = true;
      expect((await draft({}, 'mallory')).statusCode).toBe(404);
      expect((await draft({ companyIds: ['nope'] })).statusCode).toBe(400);
      expect(await db.sql`select 1 from jobs where type = 'opener'`).toHaveLength(0);
    });
  });
});

describe('lead routes in the real app', () => {
  const CLERK_JWT = 'header.payload.signature';
  let real: FastifyInstance;

  beforeAll(async () => {
    real = await buildApp(loadEnv({ NODE_ENV: 'test', CLERK_SECRET_KEY: 'sk_test_placeholder' }), {
      getSql: () => db.sql,
      store: memoryStore(),
      verifyClerk: async (token) => {
        if (token !== CLERK_JWT) throw new Error('bad jwt');
        return { userId: 'carol', sessionId: 'sess_carol' };
      },
      users: { getProfile: async () => ({ email: 'carol@example.com', name: 'Carol', imageUrl: null }) },
    });
  });

  afterAll(async () => {
    await real.close();
  });

  it('sit behind the real auth (401 without a bearer token)', async () => {
    const res = await real.inject({ method: 'GET', url: '/v1/searches' });
    expect(res.statusCode).toBe(401);
  });

  it('creates the account on the first authenticated request and serves /v1/me', async () => {
    const auth = { authorization: `Bearer ${CLERK_JWT}` };
    const list = await real.inject({ method: 'GET', url: '/v1/searches', headers: auth });
    expect(list.statusCode).toBe(200);
    expect(SearchListResponse.parse(list.json()).searches).toEqual([]);
    const [account] = await db.sql`select plan from accounts where clerk_user_id = 'carol'`;
    expect(account).toEqual({ plan: 'free' });

    const created = await real.inject({
      method: 'POST',
      url: '/v1/searches',
      headers: auth,
      payload: { kind: 'local', params: { niche: 'dentists', location: 'Aarhus' }, limit: 5 },
    });
    expect(created.statusCode).toBe(201);

    const me = await real.inject({ method: 'GET', url: '/v1/me', headers: auth });
    expect(me.statusCode).toBe(200);
    expect(MeResponse.parse(me.json())).toMatchObject({
      user: { id: 'carol', email: 'carol@example.com', name: 'Carol', imageUrl: null },
      via: 'clerk',
      plan: 'free',
      usage: { emailsVerified: 0, emailsLimit: 50 },
      maxSearchLimit: 1000,
    });
  });
});
