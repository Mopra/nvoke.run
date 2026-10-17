import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LocalCrawlClaimResponse } from '@nvoke/shared';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { periodOf } from '../../leads/plans.js';
import { suppress } from '../../leads/suppression.js';
import { leadsRoutes } from './leads.js';

let db: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(leadsRoutes, {
    prefix: '/v1',
    getSql: () => db.sql,
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
  await db.sql`truncate accounts, jobs, suppressions, domains, usage cascade`;
});

const as = (user: string) => ({ 'x-test-user': user });

async function seedSearch(user: string, opts: { status?: string; ageDays?: number } = {}): Promise<string> {
  await db.sql`insert into accounts (clerk_user_id) values (${user}) on conflict do nothing`;
  const created = new Date(Date.now() - (opts.ageDays ?? 0) * 86_400_000).toISOString();
  const [s] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, params, "limit", status, created_at)
    values (${user}, 'web', ${db.sql.json({ keyword: 'x' })}, 10, ${opts.status ?? 'done'}, ${created}::timestamptz)
    returning id`;
  return s!.id;
}

async function seedCompany(searchId: string, user: string, domain: string, crawlStatus: string): Promise<string> {
  const [c] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status, crawled_at)
    values (${searchId}, ${user}, ${domain}, ${domain}, ${`https://${domain}/`}, 'test', ${crawlStatus}, now())
    returning id`;
  return c!.id;
}

async function claim(user: string, max = 5, reasons?: string[]) {
  const res = await app.inject({ method: 'POST', url: '/v1/local-crawl/claim', headers: as(user), payload: { max, reasons } });
  expect(res.statusCode).toBe(200);
  return LocalCrawlClaimResponse.parse(res.json()).tasks;
}

function submit(user: string, body: object) {
  return app.inject({ method: 'POST', url: '/v1/local-crawl/results', headers: as(user), payload: body });
}

describe('local crawl claim', () => {
  it('hands out only the caller’s refused and JS-only companies, once per lease', async () => {
    const search = await seedSearch('alice');
    const refused = await seedCompany(search, 'alice', 'walled.dk', 'refused');
    const spa = await seedCompany(search, 'alice', 'spa.dk', 'js_only');
    await seedCompany(search, 'alice', 'done.dk', 'done');
    await seedCompany(search, 'alice', 'robots.dk', 'blocked');
    const bobs = await seedSearch('bob');
    await seedCompany(bobs, 'bob', 'bob.dk', 'refused');

    const tasks = await claim('alice');
    expect(tasks.map((t) => t.companyId).sort()).toEqual([refused, spa].sort());
    expect(tasks.find((t) => t.companyId === spa)).toMatchObject({ domain: 'spa.dk', website: 'https://spa.dk/', reason: 'js_only', searchId: search });
    expect(await claim('alice')).toEqual([]);

    // A lease that ran out is claimable again, twice in all, then the company settles as failed.
    await db.sql`update companies set local_claimed_until = now() - interval '1 minute' where id = ${refused}`;
    expect((await claim('alice')).map((t) => t.companyId)).toEqual([refused]);
    await db.sql`update companies set local_claimed_until = now() - interval '1 minute' where id = ${refused}`;
    expect(await claim('alice')).toEqual([]);
    const [row] = await db.sql<{ local_crawl: string }[]>`select local_crawl from companies where id = ${refused}`;
    expect(row!.local_crawl).toBe('failed');
  });

  it('hands out sites read without an address to a client that asks, after refused and JS-only ones', async () => {
    const search = await seedSearch('alice');
    const quiet = await seedCompany(search, 'alice', 'quiet.dk', 'done');
    const found = await seedCompany(search, 'alice', 'found.dk', 'done');
    await db.sql`insert into emails (company_id, search_id, clerk_user_id, address, kind) values (${found}, ${search}, 'alice', 'info@found.dk', 'generic')`;
    await seedCompany(search, 'alice', 'gone.dk', 'failed');
    const spa = await seedCompany(search, 'alice', 'spa.dk', 'js_only');

    // An older desktop names no reasons and gets only what it was built for.
    expect((await claim('alice', 5)).map((t) => t.companyId)).toEqual([spa]);
    const tasks = await claim('alice', 5, ['refused', 'js_only', 'done']);
    expect(tasks).toEqual([expect.objectContaining({ companyId: quiet, reason: 'done' })]);
    await db.sql`update companies set local_crawl = null, local_attempts = 0`;
    expect((await claim('alice', 1, ['refused', 'js_only', 'done'])).map((t) => t.companyId)).toEqual([spa]);
  });

  it('skips canceled and old searches, suppressed and platform domains, and a used up allowance', async () => {
    await seedCompany(await seedSearch('alice', { status: 'canceled' }), 'alice', 'canceled.dk', 'refused');
    await seedCompany(await seedSearch('alice', { ageDays: 40 }), 'alice', 'old.dk', 'refused');
    const search = await seedSearch('alice');
    await seedCompany(search, 'alice', 'optedout.dk', 'refused');
    await suppress(db.sql, { domain: 'optedout.dk' }, 'admin');
    const platform = await seedCompany(search, 'alice', 'linkedin.com', 'refused');
    expect(await claim('alice')).toEqual([]);
    const [row] = await db.sql<{ local_crawl: string }[]>`select local_crawl from companies where id = ${platform}`;
    expect(row!.local_crawl).toBe('blocked');

    await seedCompany(search, 'alice', 'walled.dk', 'refused');
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('alice', ${periodOf()}, 50)`;
    expect(await claim('alice')).toEqual([]);
  });
});

describe('local crawl results', () => {
  it('re-checks every address, stores the rest in the search and queues their checks', async () => {
    const search = await seedSearch('alice');
    const company = await seedCompany(search, 'alice', 'walled.dk', 'refused');
    await suppress(db.sql, { address: 'gone@walled.dk' }, 'admin');
    await claim('alice');

    const res = await submit('alice', {
      companyId: company,
      outcome: 'done',
      pages: 3,
      emails: [
        { address: 'Info@Walled.dk', sourceUrl: 'https://walled.dk/kontakt' },
        { address: 'mette@walled.dk', sourceUrl: 'javascript:alert(1)' },
        { address: 'hello@agency.dk', sourceUrl: 'https://walled.dk/' },
        { address: 'user@example.com', sourceUrl: null },
        { address: 'logo@2x.png', sourceUrl: null },
        { address: 'gone@walled.dk', sourceUrl: null },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stored: 2 });

    const emails = await db.sql<{ address: string; kind: string; source_url: string | null }[]>`
      select address, kind, source_url from emails where company_id = ${company} order by address`;
    expect(emails).toEqual([
      { address: 'info@walled.dk', kind: 'generic', source_url: 'https://walled.dk/kontakt' },
      { address: 'mette@walled.dk', kind: 'personal', source_url: null },
    ]);
    const jobs = await db.sql`select type from jobs where search_id = ${search}`;
    expect(jobs).toEqual([{ type: 'verify' }, { type: 'verify' }]);
    const [s] = await db.sql<{ emails_found: number }[]>`select emails_found from searches where id = ${search}`;
    expect(s!.emails_found).toBe(2);
    const [c] = await db.sql<{ local_crawl: string; crawl_status: string }[]>`select local_crawl, crawl_status from companies where id = ${company}`;
    expect(c).toEqual({ local_crawl: 'done', crawl_status: 'refused' });
    // Local results never enter the shared cache.
    expect(await db.sql`select domain from domain_emails`).toEqual([]);

    // Only once: the claim is used up.
    expect((await submit('alice', { companyId: company, outcome: 'done', pages: 1, emails: [] })).statusCode).toBe(409);
  });

  it('refuses another user’s company and one that is not claimed', async () => {
    const search = await seedSearch('alice');
    const company = await seedCompany(search, 'alice', 'walled.dk', 'refused');
    const body = { companyId: company, outcome: 'blocked', pages: 0, emails: [] };
    expect((await submit('alice', body)).json()).toEqual({ error: 'not_claimed' });
    await claim('alice');
    expect((await submit('bob', body)).statusCode).toBe(404);
    expect((await submit('alice', { ...body, pages: 9 })).statusCode).toBe(400);
    const res = await submit('alice', body);
    expect(res.json()).toEqual({ stored: 0 });
    const [c] = await db.sql<{ local_crawl: string }[]>`select local_crawl from companies where id = ${company}`;
    expect(c!.local_crawl).toBe('blocked');
  });
});
