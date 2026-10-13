import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateSearchRequest, SearchStatus } from '@nvoke/shared';
import { RateLimiter, sleep } from '../leads/limits.js';
import { ensureAccount } from '../leads/quota.js';
import { createSearch, getSearch } from '../leads/repo.js';
import { RobotsCache } from '../leads/robots.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from '../leads/sources/types.js';
import type { Verifier } from '../leads/verify/index.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { fakeFetch, silentLog } from '../testing/fakes.js';
import type { PipelineDeps } from './pipeline.js';
import { Runner } from './runner.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, email_checks, crawl_optouts cascade`;
});

function adapterOf(companies: FoundCompany[] | (() => AsyncIterable<FoundCompany>)): SourceAdapter<unknown> {
  return {
    kind: 'local',
    find: () =>
      typeof companies === 'function'
        ? companies()
        : (async function* () {
            for (const c of companies) yield c;
          })(),
  };
}

const sites = fakeFetch({
  'https://alpha.dk/': { body: '<a href="/kontakt">Kontakt</a><p>info@alpha.dk</p>' },
  'https://alpha.dk/kontakt': { body: '<p>Ole: ole@alpha.dk. Bureau: web@agency.dk</p>' },
  'https://beta.dk/': { body: '<p>Write to info@beta.dk or mette@beta.dk</p>' },
  'https://nomail.dk/': { body: '<p>No addresses here</p>' },
  'https://blocked.dk/robots.txt': { body: 'User-agent: *\nDisallow: /' },
  'https://blocked.dk/': { body: '<p>info@blocked.dk</p>' },
  'https://optedout.dk/': { body: '<p>info@optedout.dk</p>' },
});

/** info@ addresses are valid, everything else invalid. */
const stubVerifier = {
  verify: async (address: string) => ({
    address,
    verification: address.startsWith('info@') ? ('valid' as const) : ('invalid' as const),
    mxHost: 'mx.test',
    reason: 'stub',
  }),
} as unknown as Verifier;

function deps(local: SourceAdapter<unknown>): PipelineDeps {
  const limiter = new RateLimiter(1);
  return {
    sql: db.sql,
    log: silentLog,
    adapters: { local, web: local, launches: local } as AdapterRegistry,
    crawl: { fetch: sites, limiter, robots: new RobotsCache({ fetch: sites, limiter }) },
    verifier: stubVerifier,
  };
}

const LOCAL: CreateSearchRequest = { kind: 'local', params: { niche: 'dentists', location: 'Testby' } };

async function waitFor(searchId: string, statuses: SearchStatus[], timeoutMs = 20_000) {
  const start = Date.now();
  for (;;) {
    const s = await getSearch(db.sql, 'u1', searchId);
    if (s && statuses.includes(s.status)) return s;
    if (Date.now() - start > timeoutMs) throw new Error(`search still ${s?.status}`);
    await sleep(25);
  }
}

async function run(local: SourceAdapter<unknown>, req: CreateSearchRequest = LOCAL, limit = 100, until: SearchStatus[] = ['done', 'failed']) {
  await ensureAccount(db.sql, 'u1');
  const search = await createSearch(db.sql, 'u1', req, limit);
  const runner = new Runner(deps(local), { concurrency: 4, pollMs: 20 });
  runner.start();
  try {
    return await waitFor(search.id, until);
  } finally {
    await runner.stop(5_000);
  }
}

describe('pipeline', () => {
  it('finds, dedupes, crawls and verifies a search end to end', async () => {
    await db.sql`insert into crawl_optouts (domain) values ('optedout.dk')`;
    const final = await run(
      adapterOf([
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test', phone: '+45 1' },
        { name: 'Alpha again', website: 'http://www.alpha.dk/om-os', source: 'test' },
        { name: 'Beta', website: 'beta.dk', source: 'test' },
        { name: 'On Facebook', website: 'https://facebook.com/somebiz', source: 'test' },
        { name: 'No mail', website: 'https://nomail.dk', source: 'test' },
        { name: 'Blocked', website: 'https://blocked.dk', source: 'test' },
        { name: 'Opted out', website: 'https://optedout.dk', source: 'test' },
        { name: 'Bad URL', website: 'not a url', source: 'test' },
      ]),
    );
    expect(final).toMatchObject({
      status: 'done',
      error: null,
      companiesFound: 4,
      companiesCrawled: 4,
      emailsFound: 4,
      emailsValid: 2,
    });
    expect(final.startedAt).not.toBeNull();
    expect(final.finishedAt).not.toBeNull();

    const companies = await db.sql<{ domain: string; crawl_status: string }[]>`
      select domain, crawl_status from companies where search_id = ${final.id} order by domain`;
    expect(companies).toEqual([
      { domain: 'alpha.dk', crawl_status: 'done' },
      { domain: 'beta.dk', crawl_status: 'done' },
      { domain: 'blocked.dk', crawl_status: 'blocked' },
      { domain: 'nomail.dk', crawl_status: 'done' },
    ]);
    const emails = await db.sql<{ address: string; kind: string; verification: string }[]>`
      select address, kind, verification from emails where search_id = ${final.id} order by address`;
    expect(emails).toEqual([
      { address: 'info@alpha.dk', kind: 'generic', verification: 'valid' },
      { address: 'info@beta.dk', kind: 'generic', verification: 'valid' },
      { address: 'mette@beta.dk', kind: 'personal', verification: 'invalid' },
      { address: 'ole@alpha.dk', kind: 'personal', verification: 'invalid' },
    ]);
    // Only the two valid addresses are charged.
    const [usage] = await db.sql<{ emails_verified: number }[]>`select emails_verified from usage where clerk_user_id = 'u1'`;
    expect(usage?.emails_verified).toBe(2);
    const billed = await db.sql`select address from billed_emails where clerk_user_id = 'u1' order by address`;
    expect(billed).toEqual([{ address: 'info@alpha.dk' }, { address: 'info@beta.dk' }]);
    const open = await db.sql`select 1 from jobs where search_id = ${final.id} and status in ('queued', 'running')`;
    expect(open).toHaveLength(0);
  });

  it('stops finding at the search limit', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `C${i}`, website: `https://c${i}.dk`, source: 'test' }));
    const final = await run(adapterOf(many), LOCAL, 3);
    expect(final.companiesFound).toBe(3);
  });

  it('fails the search with quota_exceeded when the monthly quota runs out', async () => {
    await ensureAccount(db.sql, 'u1');
    const period = new Date().toISOString().slice(0, 7);
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('u1', ${period}, 49)`;
    const final = await run(
      adapterOf([
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test' },
      ]),
    );
    expect(final.status).toBe('failed');
    expect(final.error).toBe('quota_exceeded');
    expect(final.emailsValid).toBe(1);
    const [usage] = await db.sql<{ emails_verified: number }[]>`select emails_verified from usage where clerk_user_id = 'u1'`;
    expect(usage?.emails_verified).toBe(50);
    // The valid address that did not fit stays unchecked, so it is never shown.
    const valid = await db.sql`select 1 from emails where search_id = ${final.id} and verification = 'valid'`;
    expect(valid).toHaveLength(1);
  });

  it('fails the search with the adapter message on a permanent error', async () => {
    const broken = adapterOf(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new PermanentError('web search is not configured on this server (BRAVE_SEARCH_API_KEY is not set)')),
      }),
    }));
    const final = await run(broken, { kind: 'web', params: { keyword: 'x' } });
    expect(final.status).toBe('failed');
    expect(final.error).toMatch(/BRAVE_SEARCH_API_KEY/);
    const [job] = await db.sql<{ attempts: number; status: string }[]>`select attempts, status from jobs where search_id = ${final.id}`;
    expect(job).toEqual({ attempts: 1, status: 'failed' });
  });

  it('marks a search with no companies done', async () => {
    const final = await run(adapterOf([]));
    expect(final).toMatchObject({ status: 'done', companiesFound: 0 });
  });

  it('hands running jobs back to the queue on shutdown without spending an attempt', async () => {
    let started = false;
    const slow = adapterOf(async function* () {
      started = true;
      await sleep(10_000);
      yield { name: 'Late', website: 'https://late.dk', source: 'test' };
    });
    await ensureAccount(db.sql, 'u1');
    const search = await createSearch(db.sql, 'u1', LOCAL, 10);
    const runner = new Runner(deps(slow), { concurrency: 2, pollMs: 10 });
    runner.start();
    while (!started) await sleep(10);
    expect(runner.inFlight).toBe(1);
    await runner.stop(50);
    const [job] = await db.sql<{ status: string; attempts: number }[]>`select status, attempts from jobs where search_id = ${search.id}`;
    expect(job).toEqual({ status: 'queued', attempts: 0 });
    expect(runner.inFlight).toBe(0);
  });

  it('keeps a canceled search canceled and skips its remaining work', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const gated = adapterOf(async function* () {
      yield { name: 'Alpha', website: 'https://alpha.dk', source: 'test' };
      await gate;
      yield { name: 'Beta', website: 'https://beta.dk', source: 'test' };
    });
    await ensureAccount(db.sql, 'u1');
    const search = await createSearch(db.sql, 'u1', LOCAL, 10);
    const runner = new Runner(deps(gated), { concurrency: 1, pollMs: 10 });
    runner.start();
    try {
      for (;;) {
        const [c] = await db.sql`select 1 from companies where search_id = ${search.id}`;
        if (c) break;
        await sleep(10);
      }
      await db.sql`update searches set status = 'canceled', finished_at = now() where id = ${search.id}`;
      await db.sql`update jobs set status = 'canceled' where search_id = ${search.id} and status = 'queued'`;
      release();
      await sleep(300);
    } finally {
      await runner.stop(2_000);
    }
    const s = await getSearch(db.sql, 'u1', search.id);
    expect(s?.status).toBe('canceled');
    const emails = await db.sql`select 1 from emails where search_id = ${search.id}`;
    expect(emails).toHaveLength(0);
  });
});
