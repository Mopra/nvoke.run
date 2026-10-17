import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateSearchRequest, SearchStatus } from '@nvoke/shared';
import { storeItems } from '../feed/collect.js';
import { createDrop, dropAdapter, runDueDrops } from '../feed/drops.js';
import { RateLimiter, sleep } from '../leads/limits.js';
import { ensureAccount } from '../leads/quota.js';
import { createSearch, exportRows, getSearch, listCompanies } from '../leads/repo.js';
import { RobotsCache } from '../leads/robots.js';
import { domainsAdapter } from '../leads/sources/domains.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import { BRAVE_ENDPOINT, braveClient } from '../leads/sources/web.js';
import { PermanentError, SourceUnavailableError, type FoundCompany, type SourceAdapter } from '../leads/sources/types.js';
import type { Alert } from '../alerts.js';
import { addressHash, domainHash, suppress } from '../leads/suppression.js';
import type { Verifier } from '../leads/verify/index.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { fakeFetch, silentLog } from '../testing/fakes.js';
import { GREYLIST_DELAY_MS, GREYLIST_RETRIES, runVerify, type PipelineDeps } from './pipeline.js';
import type { Job } from './queue.js';
import { Runner } from './runner.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, email_checks, suppressions, domains, source_pauses cascade`;
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
  'https://freemail.dk/': { body: '<p>Skriv til info@gmail.com</p>' },
  'https://agencyonly.dk/': { body: '<p>Site by hello@webagency.dk</p>' },
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

/** Brave knows Beta ApS by its LinkedIn page and its own site. */
const braveFetch = fakeFetch({
  [BRAVE_ENDPOINT]: (url) => ({
    body: JSON.stringify({
      web: {
        results:
          url.searchParams.get('q') === 'Beta ApS'
            ? [{ url: 'https://www.linkedin.com/company/beta' }, { url: 'https://beta.dk/' }]
            : [],
      },
    }),
  }),
});

function deps(local: SourceAdapter<unknown>): PipelineDeps {
  const limiter = new RateLimiter(1);
  return {
    sql: db.sql,
    log: silentLog,
    adapters: {
      local,
      web: local,
      launches: local,
      domains: domainsAdapter(braveClient({ apiKey: 'k', fetch: braveFetch, requestsPerSecond: 1_000 })),
      drop: dropAdapter(() => db.sql),
    } as AdapterRegistry,
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
  it('runs a drop search from the feed', async () => {
    await db.sql`truncate feed_items`;
    await ensureAccount(db.sql, 'u1');
    await storeItems(db.sql, [
      { source: 'show_hn', sourceRef: '1', name: 'Alpha', website: 'https://alpha.dk', launchedAt: new Date() },
      { source: 'yc', sourceRef: 'beta', name: 'Beta', website: 'https://beta.dk' },
    ]);
    const drop = await createDrop(db.sql, 'u1', { name: 'Everything' });
    const [ran] = await runDueDrops(db.sql, silentLog);
    expect(ran).toMatchObject({ dropId: drop.id, outcome: 'delivered' });
    const runner = new Runner(deps(adapterOf([])), { concurrency: 4, pollMs: 20 });
    runner.start();
    try {
      const [search] = await db.sql<{ id: string }[]>`select id from searches where drop_id = ${drop.id}`;
      const final = await waitFor(search!.id, ['done', 'failed']);
      expect(final).toMatchObject({ kind: 'drop', status: 'done', companiesFound: 2, emailsValid: 2 });
      expect(final.params).toMatchObject({ dropId: drop.id, dropName: 'Everything' });
    } finally {
      await runner.stop(5_000);
    }
  });

  it('finds, dedupes, crawls and verifies a search end to end', async () => {
    await suppress(db.sql, { domain: 'optedout.dk' }, 'bot_page');
    const final = await run(
      adapterOf([
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test', phone: '+45 1' },
        { name: 'Alpha again', website: 'http://www.alpha.dk/om-os', source: 'test' },
        { name: 'Beta', website: 'beta.dk', source: 'test' },
        { name: 'On Facebook', website: 'https://facebook.com/somebiz', source: 'test' },
        { name: 'No mail', website: 'https://nomail.dk', source: 'test' },
        { name: 'Blocked', website: 'https://blocked.dk', source: 'test' },
        { name: 'Opted out', website: 'https://optedout.dk', source: 'test' },
        { name: 'Opted out shop', website: 'https://shop.optedout.dk', source: 'test' },
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

  it('runs a domains search: domains as given, names through web search', async () => {
    const req: CreateSearchRequest = {
      kind: 'domains',
      params: { items: ['https://www.alpha.dk/om-os', 'Beta ApS', 'Nobody Knows Us', 'someone@gmail.com', 'facebook.com'] },
    };
    const final = await run(adapterOf([]), req, 5);
    expect(final).toMatchObject({ kind: 'domains', status: 'done', companiesFound: 2, emailsValid: 2 });
    const companies = await db.sql`select name, domain, source from companies where search_id = ${final.id} order by domain`;
    expect(companies).toEqual([
      { name: 'Alpha', domain: 'alpha.dk', source: 'list' },
      { name: 'Beta ApS', domain: 'beta.dk', source: 'brave' },
    ]);
    const [row] = await db.sql`select source_requests from searches where id = ${final.id}`;
    expect(row).toEqual({ source_requests: 2 });
  });

  it('queues lead.ready per company with a valid address, then search.finished', async () => {
    await ensureAccount(db.sql, 'u1');
    const [hook] = await db.sql<{ id: string }[]>`
      insert into webhooks (clerk_user_id, url, secret, events)
      values ('u1', 'https://hooks.example.com/x', 'whsec_eA==', '{lead.ready,search.finished}')
      returning id`;
    const [dropsOnly] = await db.sql<{ id: string }[]>`
      insert into webhooks (clerk_user_id, url, secret, events, scope)
      values ('u1', 'https://hooks.example.com/y', 'whsec_eA==', '{lead.ready,search.finished}', 'drops')
      returning id`;
    const final = await run(
      adapterOf([
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test' },
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
        { name: 'No mail', website: 'https://nomail.dk', source: 'test' },
      ]),
    );
    expect(final.status).toBe('done');
    const queued = await db.sql<{ event: string; domain: string | null }[]>`
      select d.event, c.domain from webhook_deliveries d left join companies c on c.id = d.company_id
      where d.webhook_id = ${hook!.id} order by d.event, c.domain`;
    expect(queued).toEqual([
      { event: 'lead.ready', domain: 'alpha.dk' },
      { event: 'lead.ready', domain: 'beta.dk' },
      { event: 'search.finished', domain: null },
    ]);
    expect(await db.sql`select 1 from webhook_deliveries where webhook_id = ${dropsOnly!.id}`).toHaveLength(0);
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

  it('records paid source requests and cache hits on the search', async () => {
    const counting: SourceAdapter<unknown> = {
      kind: 'web',
      async *find(_params, ctx) {
        ctx.onUsage?.('request');
        ctx.onUsage?.('request');
        ctx.onUsage?.('cache_hit');
        yield* [];
      },
    };
    const final = await run(counting, { kind: 'web', params: { keyword: 'x' } });
    const [row] = await db.sql`select source_requests, source_cache_hits from searches where id = ${final.id}`;
    expect(row).toEqual({ source_requests: 2, source_cache_hits: 1 });
  });

  it('pauses the source, alerts and fails with source_unavailable when Brave refuses us', async () => {
    const sent: Alert[] = [];
    const refused: SourceAdapter<unknown> = {
      kind: 'web',
      async *find() {
        yield* [];
        throw new SourceUnavailableError('brave', 'the monthly quota or spend limit is reached (429)');
      },
    };
    await ensureAccount(db.sql, 'u1');
    const search = await createSearch(db.sql, 'u1', { kind: 'web', params: { keyword: 'x' } }, 10);
    const runner = new Runner({ ...deps(refused), alert: { send: async (a) => (sent.push(a), true) } }, { concurrency: 1, pollMs: 10 });
    runner.start();
    try {
      const final = await waitFor(search.id, ['failed']);
      expect(final.error).toBe('source_unavailable');
    } finally {
      await runner.stop(5_000);
    }
    const [pause] = await db.sql`select source, reason from source_pauses`;
    expect(pause).toEqual({ source: 'brave', reason: 'the monthly quota or spend limit is reached (429)' });
    expect(sent.map((a) => a.key)).toEqual(['source-unavailable:brave']);
  });

  it('alerts when Brave spend passes 80% of the monthly budget', async () => {
    const sent: Alert[] = [];
    const counting: SourceAdapter<unknown> = {
      kind: 'web',
      async *find(_params, ctx) {
        for (let i = 0; i < 9; i++) ctx.onUsage?.('request');
        yield* [];
      },
    };
    await ensureAccount(db.sql, 'u1');
    const search = await createSearch(db.sql, 'u1', { kind: 'web', params: { keyword: 'x' } }, 10);
    const budget = { monthlyUsd: 0.05, costPer1000Usd: 5 };
    const runner = new Runner({ ...deps(counting), braveBudget: budget, alert: { send: async (a) => (sent.push(a), true) } }, { concurrency: 1, pollMs: 10 });
    runner.start();
    try {
      await waitFor(search.id, ['done']);
    } finally {
      await runner.stop(5_000);
    }
    expect(sent.map((a) => a.key)).toEqual([`brave-budget:${new Date().toISOString().slice(0, 7)}:80`]);
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

const DAY = 86_400_000;

function fetchedHosts(): Set<string> {
  return new Set(sites.calls.map((c) => new URL(c.url).hostname));
}

async function cacheRow(domain: string, row: { status?: string; hasPersonal?: boolean; recheckInDays: number }) {
  await db.sql`
    insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at)
    values (${domain}, ${row.status ?? 'done'}, now() - interval '10 days', ${row.hasPersonal ?? false},
            now() + ${row.recheckInDays} * interval '1 day')
  `;
}

async function cacheEmail(domain: string, address: string, firstSeen = '2026-01-15T00:00:00Z') {
  await db.sql`
    insert into domain_emails (domain, address, source_url, first_seen, last_seen)
    values (${domain}, ${address}, ${`https://${domain}/kontakt`}, ${firstSeen}, ${firstSeen})
  `;
}

describe('crawl cache', () => {
  it('serves a fresh domain without personal addresses from the cache', async () => {
    await cacheRow('cached.dk', { recheckInDays: 30 });
    await cacheEmail('cached.dk', 'info@cached.dk');
    sites.calls.length = 0;
    const final = await run(adapterOf([{ name: 'Cached', website: 'https://cached.dk', source: 'test' }]));
    expect(fetchedHosts().has('cached.dk')).toBe(false);
    expect(final).toMatchObject({ status: 'done', companiesCrawled: 1, emailsFound: 1, emailsValid: 1 });
    const emails = await db.sql`select address, kind, source_url, verification from emails where search_id = ${final.id}`;
    expect(emails).toEqual([
      { address: 'info@cached.dk', kind: 'generic', source_url: 'https://cached.dk/kontakt', verification: 'valid' },
    ]);
    // Cached or not, a valid address is charged.
    const [usage] = await db.sql<{ emails_verified: number }[]>`select emails_verified from usage where clerk_user_id = 'u1'`;
    expect(usage?.emails_verified).toBe(1);
  });

  it('serves a fresh blocked domain from the cache without emails', async () => {
    await cacheRow('alpha.dk', { status: 'blocked', hasPersonal: true, recheckInDays: 3 });
    sites.calls.length = 0;
    const final = await run(adapterOf([{ name: 'Alpha', website: 'https://alpha.dk', source: 'test' }]));
    expect(fetchedHosts().has('alpha.dk')).toBe(false);
    const [company] = await db.sql`select crawl_status from companies where search_id = ${final.id}`;
    expect(company).toEqual({ crawl_status: 'blocked' });
  });

  it('crawls a fresh domain again when it had personal addresses', async () => {
    await cacheRow('beta.dk', { hasPersonal: true, recheckInDays: 30 });
    await cacheEmail('beta.dk', 'info@beta.dk');
    sites.calls.length = 0;
    const final = await run(adapterOf([{ name: 'Beta', website: 'https://beta.dk', source: 'test' }]));
    expect(fetchedHosts().has('beta.dk')).toBe(true);
    const emails = await db.sql`select address from emails where search_id = ${final.id} order by address`;
    expect(emails).toEqual([{ address: 'info@beta.dk' }, { address: 'mette@beta.dk' }]);
  });

  it('records a first crawl, caching generic addresses only', async () => {
    await run(
      adapterOf([
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
        { name: 'No mail', website: 'https://nomail.dk', source: 'test' },
        { name: 'Blocked', website: 'https://blocked.dk', source: 'test' },
      ]),
    );
    const domains = await db.sql<{ domain: string; crawl_status: string; has_personal: boolean; days: number }[]>`
      select domain, crawl_status, has_personal,
             round(extract(epoch from recheck_at - crawled_at) / 86400)::int as days
      from domains order by domain`;
    expect(domains).toEqual([
      { domain: 'beta.dk', crawl_status: 'done', has_personal: true, days: 90 },
      { domain: 'blocked.dk', crawl_status: 'blocked', has_personal: false, days: 7 },
      { domain: 'nomail.dk', crawl_status: 'done', has_personal: false, days: 90 },
    ]);
    const cached = await db.sql`select domain, address from domain_emails order by address`;
    expect(cached).toEqual([{ domain: 'beta.dk', address: 'info@beta.dk' }]);
    // The pages' text is kept for openers, without addresses, and not for a blocked site.
    const pages = await db.sql`select domain, url, text from domain_pages order by domain`;
    expect(pages).toEqual([
      { domain: 'beta.dk', url: 'https://beta.dk/', text: 'Write to or' },
      { domain: 'nomail.dk', url: 'https://nomail.dk/', text: 'No addresses here' },
    ]);
  });

  it('recrawls a stale domain, keeps first_seen and drops vanished addresses', async () => {
    await cacheRow('nomail.dk', { recheckInDays: -1 });
    await cacheEmail('nomail.dk', 'gone@nomail.dk');
    await cacheRow('beta.dk', { recheckInDays: -1 });
    await cacheEmail('beta.dk', 'info@beta.dk');
    sites.calls.length = 0;
    await run(
      adapterOf([
        { name: 'No mail', website: 'https://nomail.dk', source: 'test' },
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
      ]),
    );
    expect(fetchedHosts().has('nomail.dk')).toBe(true);
    expect(fetchedHosts().has('beta.dk')).toBe(true);
    const cached = await db.sql<{ address: string; first_seen: Date; last_seen: Date }[]>`
      select address, first_seen, last_seen from domain_emails order by address`;
    expect(cached.map((r) => r.address)).toEqual(['info@beta.dk']);
    expect(cached[0]!.first_seen.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(cached[0]!.last_seen.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const [beta] = await db.sql<{ recheck_at: Date; has_personal: boolean }[]>`
      select recheck_at, has_personal from domains where domain = 'beta.dk'`;
    expect(beta!.has_personal).toBe(true);
    expect(beta!.recheck_at.getTime()).toBeGreaterThan(Date.now() + 89 * DAY);
  });

  it('never stores a suppressed address, in the search or the cache', async () => {
    await suppress(db.sql, { address: 'info@beta.dk' }, 'opt_out_page');
    const final = await run(adapterOf([{ name: 'Beta', website: 'https://beta.dk', source: 'test' }]));
    const emails = await db.sql`select address from emails where search_id = ${final.id}`;
    expect(emails).toEqual([{ address: 'mette@beta.dk' }]);
    const cached = await db.sql`select address from domain_emails`;
    expect(cached).toEqual([]);
  });

  it('does not serve a suppressed address from the cache', async () => {
    await cacheRow('cached.dk', { recheckInDays: 30 });
    await cacheEmail('cached.dk', 'info@cached.dk');
    await cacheEmail('cached.dk', 'salg@cached.dk');
    await db.sql`insert into suppressions (hash, kind) values (${addressHash('info@cached.dk')}, 'address')`;
    const final = await run(adapterOf([{ name: 'Cached', website: 'https://cached.dk', source: 'test' }]));
    const emails = await db.sql`select address from emails where search_id = ${final.id}`;
    expect(emails).toEqual([{ address: 'salg@cached.dk' }]);
  });

  it('hides addresses and domains suppressed after they were found from results and export', async () => {
    const final = await run(
      adapterOf([
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test' },
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
      ]),
    );
    const before = await exportRows(db.sql, 'u1', final.id, {});
    expect(before.map((r) => r.email).sort()).toEqual(['info@alpha.dk', 'info@beta.dk', 'mette@beta.dk', 'ole@alpha.dk']);

    // Inserted directly, so the rows stay and only the read filter hides them.
    await db.sql`insert into suppressions (hash, kind) values (${addressHash('info@alpha.dk')}, 'address')`;
    await db.sql`insert into suppressions (hash, kind) values (${domainHash('beta.dk')}, 'domain')`;
    const after = await exportRows(db.sql, 'u1', final.id, {});
    expect(after.map((r) => r.email)).toEqual(['ole@alpha.dk']);
    const page = await listCompanies(db.sql, 'u1', final.id, { limit: 50 });
    expect(page?.total).toBe(1);
    expect(page?.companies.map((c) => [c.domain, c.emails.map((e) => e.address)])).toEqual([['alpha.dk', ['ole@alpha.dk']]]);
    const searched = await listCompanies(db.sql, 'u1', final.id, { limit: 50, q: 'info@alpha' });
    expect(searched?.total).toBe(0);
  });

  it('erases stored rows when an address or domain is suppressed', async () => {
    const final = await run(
      adapterOf([
        { name: 'Alpha', website: 'https://alpha.dk', source: 'test' },
        { name: 'Beta', website: 'https://beta.dk', source: 'test' },
      ]),
    );
    await suppress(db.sql, { address: 'INFO@alpha.dk' }, 'email');
    await suppress(db.sql, { domain: 'www.beta.dk' }, 'admin');
    const emails = await db.sql`select address from emails where search_id = ${final.id} order by address`;
    expect(emails).toEqual([{ address: 'ole@alpha.dk' }]);
    const cached = await db.sql`select domain from domains order by domain`;
    expect(cached).toEqual([{ domain: 'alpha.dk' }]);
    expect(await db.sql`select address from domain_emails`).toEqual([]);
  });

  it('never caches webmail or addresses on other domains, and crawls such domains again', async () => {
    const final = await run(
      adapterOf([
        { name: 'Freemail', website: 'https://freemail.dk', source: 'test' },
        { name: 'Agency only', website: 'https://agencyonly.dk', source: 'test' },
      ]),
    );
    const emails = await db.sql`select address, kind from emails where search_id = ${final.id} order by address`;
    expect(emails).toEqual([
      { address: 'hello@webagency.dk', kind: 'generic' },
      { address: 'info@gmail.com', kind: 'personal' },
    ]);
    expect(await db.sql`select address from domain_emails`).toEqual([]);
    const domains = await db.sql`select domain, has_personal from domains order by domain`;
    expect(domains).toEqual([
      { domain: 'agencyonly.dk', has_personal: true },
      { domain: 'freemail.dk', has_personal: true },
    ]);
  });
});

describe('greylisting', () => {
  const greyVerifier = {
    verify: async (address: string) => ({ address, verification: 'unknown' as const, mxHost: 'mx.test', reason: 'rcpt_tempfail_451' }),
  } as unknown as Verifier;

  async function seedEmail() {
    await ensureAccount(db.sql, 'u1');
    const search = await createSearch(db.sql, 'u1', LOCAL, 10);
    await db.sql`update searches set status = 'running' where id = ${search.id}`;
    const [company] = await db.sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source)
      values (${search.id}, 'u1', 'Grey', 'grey.dk', 'https://grey.dk', 'test') returning id
    `;
    const [email] = await db.sql<{ id: string }[]>`
      insert into emails (company_id, search_id, clerk_user_id, address, kind)
      values (${company!.id}, ${search.id}, 'u1', 'info@grey.dk', 'generic') returning id
    `;
    return { searchId: search.id, emailId: email!.id };
  }

  function verifyJob(payload: Record<string, unknown>, searchId: string): Job {
    return { id: '1', type: 'verify', payload, searchId, attempts: 1, maxAttempts: 3 };
  }

  it('asks again in ten minutes, twice, then settles as unknown', async () => {
    const { searchId, emailId } = await seedEmail();
    await db.sql`delete from jobs`;
    const now = new Date('2026-10-13T12:00:00Z');
    const d = { ...deps(adapterOf([])), verifier: greyVerifier, now: () => now };
    const signal = new AbortController().signal;

    await runVerify(d, verifyJob({ emailId }, searchId), signal);
    const [retry] = await db.sql<{ payload: { retry: number }; run_after: Date }[]>`select payload, run_after from jobs where type = 'verify'`;
    expect(retry?.payload.retry).toBe(1);
    expect(retry?.run_after.getTime()).toBe(now.getTime() + GREYLIST_DELAY_MS);
    expect((await db.sql`select verification from emails where id = ${emailId}`)[0]?.verification).toBeNull();

    await runVerify(d, verifyJob({ emailId, retry: GREYLIST_RETRIES }, searchId), signal);
    expect((await db.sql`select verification from emails where id = ${emailId}`)[0]?.verification).toBe('unknown');
    expect(await db.sql`select 1 from jobs where type = 'verify'`).toHaveLength(1);
  });

  it('puts a paced check back in the queue without counting it as a retry', async () => {
    const { searchId, emailId } = await seedEmail();
    await db.sql`delete from jobs`;
    const now = new Date('2026-10-13T12:00:00Z');
    const paced = {
      verify: async (address: string) => ({ address, verification: 'unknown' as const, mxHost: 'mx.test', reason: 'smtp_paced', retryAfterMs: 30_000 }),
    } as unknown as Verifier;
    const d = { ...deps(adapterOf([])), verifier: paced, now: () => now };
    await runVerify(d, verifyJob({ emailId, retry: GREYLIST_RETRIES }, searchId), new AbortController().signal);
    const [again] = await db.sql<{ payload: { retry: number }; run_after: Date }[]>`select payload, run_after from jobs where type = 'verify'`;
    expect(again?.payload.retry).toBe(GREYLIST_RETRIES);
    expect(again!.run_after.getTime() - now.getTime()).toBeGreaterThanOrEqual(30_000);
    expect(again!.run_after.getTime() - now.getTime()).toBeLessThan(90_000);
    expect((await db.sql`select verification from emails where id = ${emailId}`)[0]?.verification).toBeNull();
  });
});
