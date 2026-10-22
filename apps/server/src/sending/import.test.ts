import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RateLimiter, sleep } from '../leads/limits.js';
import { ensureAccount } from '../leads/quota.js';
import { RobotsCache } from '../leads/robots.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import { suppress } from '../leads/suppression.js';
import type { Verifier } from '../leads/verify/index.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { fakeFetch, silentLog } from '../testing/fakes.js';
import type { PipelineDeps } from '../worker/pipeline.js';
import { Runner } from '../worker/runner.js';
import { recipientCountry } from './gate.js';
import { importLeads, parseCsv, parseImportFile, type ImportLead } from './import.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, email_checks, suppressions, domains cascade`;
  await ensureAccount(db.sql, 'u1');
});

const lead = (o: Partial<ImportLead> & Pick<ImportLead, 'domain' | 'address'>): ImportLead => ({ fitReason: 'certificate ends 2026-11-09', ...o });

describe('importLeads', () => {
  it('creates an import search with its companies and addresses, and queues a crawl and a check for each', async () => {
    const result = await importLeads(
      db.sql,
      'u1',
      [
        lead({ domain: 'https://www.Acme-Dental.com/about', address: 'info@acme-dental.com', location: 'Galloway, NJ', country: 'US', category: 'Dentist' }),
        lead({ domain: 'beta.io', address: 'jane@beta-mail.com', name: 'Beta Studio', firstName: 'Jane', lastName: 'Doe', title: 'Founder', sourceUrl: 'https://beta.io/contact' }),
      ],
      { label: 'exit1 ssl' },
    );
    expect(result).toMatchObject({ companies: 2, emails: 2, refreshed: 0, skipped: {} });

    const [search] = await db.sql`select kind, params, status, "limit", check_inboxes, companies_found, emails_found from searches where id = ${result.searchId}`;
    expect(search).toMatchObject({ kind: 'domains', status: 'running', limit: 2, check_inboxes: true, companies_found: 2, emails_found: 2 });
    expect(search!.params).toEqual({ items: ['acme-dental.com', 'beta.io'], import: true, label: 'exit1 ssl' });

    const companies = await db.sql<{ name: string; domain: string; website: string; source: string; source_ref: string | null; location: string | null; category: string | null; fit_reason: string }[]>`
      select name, domain, website, source, source_ref, location, category, fit_reason from companies where search_id = ${result.searchId} order by domain`;
    expect(companies).toEqual([
      {
        name: 'Acme Dental',
        domain: 'acme-dental.com',
        website: 'https://acme-dental.com/',
        source: 'import',
        source_ref: null,
        location: 'Galloway, NJ, US',
        category: 'Dentist',
        fit_reason: 'certificate ends 2026-11-09',
      },
      {
        name: 'Beta Studio',
        domain: 'beta.io',
        website: 'https://beta.io/',
        source: 'import',
        source_ref: 'https://beta.io/contact',
        location: null,
        category: null,
        fit_reason: 'certificate ends 2026-11-09',
      },
    ]);
    // The sending gate reads the country from the location.
    expect(recipientCountry({ location: companies[0]!.location, domain: 'acme-dental.com' })).toBe('US');

    const emails = await db.sql`
      select address, kind, found_via, confidence, first_name, last_name, title, seniority, verification from emails
      where search_id = ${result.searchId} order by address`;
    expect(emails).toEqual([
      { address: 'info@acme-dental.com', kind: 'generic', found_via: 'page', confidence: 100, first_name: null, last_name: null, title: null, seniority: null, verification: null },
      { address: 'jane@beta-mail.com', kind: 'personal', found_via: 'page', confidence: 100, first_name: 'Jane', last_name: 'Doe', title: 'Founder', seniority: 'founder', verification: null },
    ]);
    const jobs = await db.sql`select type, count(*)::int as n from jobs where search_id = ${result.searchId} and status = 'queued' group by type order by type`;
    expect(jobs).toEqual([
      { type: 'crawl', n: 2 },
      { type: 'verify', n: 2 },
    ]);
  });

  it('appends to an import, keeping a known company and refreshing its fit_reason', async () => {
    const first = await importLeads(db.sql, 'u1', [lead({ domain: 'acme.com', address: 'info@acme.com', fitReason: 'old fact' })]);
    await db.sql`update searches set status = 'done' where id = ${first.searchId}`;
    const again = await importLeads(
      db.sql,
      'u1',
      [lead({ domain: 'acme.com', address: 'info@acme.com', fitReason: 'new fact' }), lead({ domain: 'gamma.com', address: 'hi@gamma.com' })],
      { searchId: first.searchId },
    );
    expect(again).toMatchObject({ searchId: first.searchId, companies: 1, emails: 1, refreshed: 1 });
    const companies = await db.sql`select domain, fit_reason from companies where search_id = ${first.searchId} order by domain`;
    expect(companies).toEqual([
      { domain: 'acme.com', fit_reason: 'new fact' },
      { domain: 'gamma.com', fit_reason: 'certificate ends 2026-11-09' },
    ]);
    const [search] = await db.sql`select params, status, "limit", companies_found, emails_found from searches where id = ${first.searchId}`;
    expect(search).toMatchObject({ status: 'running', limit: 2, companies_found: 2, emails_found: 2 });
    expect((search!.params as { items: string[] }).items).toEqual(['acme.com', 'gamma.com']);
    const [jobs] = await db.sql`select count(*)::int as n from jobs where search_id = ${first.searchId}`;
    expect(jobs!.n).toBe(4);
  });

  it('refuses to append to a search that is not an import of the user', async () => {
    const [other] = await db.sql<{ id: string }[]>`insert into searches (clerk_user_id, kind, "limit") values ('u1', 'domains', 1) returning id`;
    await expect(importLeads(db.sql, 'u1', [], { searchId: other!.id })).rejects.toThrow('not an import');
    const mine = await importLeads(db.sql, 'u1', [lead({ domain: 'acme.com', address: 'info@acme.com' })]);
    await ensureAccount(db.sql, 'u2');
    await expect(importLeads(db.sql, 'u2', [], { searchId: mine.searchId })).rejects.toThrow('not found');
  });

  it('skips suppressed addresses and domains, sites that are no company domain, and repeats', async () => {
    await suppress(db.sql, { address: 'gone@acme.com' }, 'email');
    await suppress(db.sql, { domain: 'optedout.com' }, 'opt_out_page');
    const result = await importLeads(db.sql, 'u1', [
      lead({ domain: 'acme.com', address: 'gone@acme.com' }),
      lead({ domain: 'shop.optedout.com', address: 'info@shop.optedout.com' }),
      lead({ domain: 'site.com', address: 'owner@optedout.com' }),
      lead({ domain: 'facebook.com', address: 'x@acme.com' }),
      lead({ domain: 'gmail.com', address: 'y@gmail.com' }),
      lead({ domain: 'acme.com', address: 'info@acme.com' }),
      lead({ domain: 'acme2.com', address: 'info@acme.com' }),
    ]);
    expect(result).toMatchObject({ companies: 1, emails: 1, skipped: { suppressed: 3, bad_domain: 2, duplicate: 1 } });
    const emails = await db.sql`select address from emails where search_id = ${result.searchId}`;
    expect(emails).toEqual([{ address: 'info@acme.com' }]);
  });

  it('ends done at once when nothing was imported', async () => {
    const result = await importLeads(db.sql, 'u1', [lead({ domain: 'facebook.com', address: 'x@acme.com' })]);
    const [search] = await db.sql`select status, finished_at from searches where id = ${result.searchId}`;
    expect(search!.status).toBe('done');
    expect(search!.finished_at).not.toBeNull();
  });
});

describe('the crawl of an import', () => {
  const sites = fakeFetch({
    'https://acme.com/': { body: '<html><head><title>Acme</title></head><a href="/team">Team</a><p>Mail info@acme.com or ole@acme.com</p></html>' },
    'https://acme.com/team': { body: '<div><h3>Mette Hansen</h3><p>CEO</p><a href="mailto:mette@acme.com">Mail</a></div>' },
  });
  const verifier = {
    verify: async (address: string) => ({ address, verification: 'valid' as const, mxHost: 'mx.test', reason: 'stub' }),
  } as unknown as Verifier;

  it('fills the page cache but stores no addresses or people, and checks the imported address', async () => {
    const limiter = new RateLimiter(1);
    const deps: PipelineDeps = {
      sql: db.sql,
      log: silentLog,
      adapters: {} as AdapterRegistry,
      crawl: { fetch: sites, limiter, robots: new RobotsCache({ fetch: sites, limiter }) },
      verifier,
    };
    const { searchId } = await importLeads(db.sql, 'u1', [lead({ domain: 'acme.com', address: 'contact@acme.com' })]);
    const runner = new Runner(deps, { concurrency: 2, pollMs: 20 });
    runner.start();
    try {
      const start = Date.now();
      for (;;) {
        const [s] = await db.sql`select status from searches where id = ${searchId}`;
        if (s!.status === 'done') break;
        if (Date.now() - start > 20_000) throw new Error(`search still ${s!.status}`);
        await sleep(25);
      }
    } finally {
      await runner.stop(5_000);
    }
    const [search] = await db.sql`select companies_crawled, emails_found, emails_valid from searches where id = ${searchId}`;
    expect(search).toEqual({ companies_crawled: 1, emails_found: 1, emails_valid: 1 });
    const emails = await db.sql`select address, verification from emails where search_id = ${searchId}`;
    expect(emails).toEqual([{ address: 'contact@acme.com', verification: 'valid' }]);
    const people = await db.sql`select 1 from people where search_id = ${searchId}`;
    expect(people).toHaveLength(0);
    const [crawled] = await db.sql`select crawl_status from companies where search_id = ${searchId}`;
    expect(crawled!.crawl_status).toBe('done');
    // The pages land in the shared cache, where write.ts reads them.
    const pages = await db.sql`select url from domain_pages where domain = 'acme.com' order by url`;
    expect(pages.length).toBeGreaterThan(0);
    const jobs = await db.sql`select type from jobs where search_id = ${searchId} and type = 'people'`;
    expect(jobs).toHaveLength(0);
  });
});

describe('parseImportFile', () => {
  it('reads a CSV by its header, with quoted cells, and lists bad rows by line', () => {
    const csv = [
      'domain,address,name,location,country,fit_reason,source_url',
      'acme.com,Info@Acme.com,"Acme, Inc.","Galloway, NJ",us,"cert ends ""soon""",',
      'beta.io,not-an-address,,,,fact,',
      '',
      'gamma.com,hi@gamma.com,,,,,',
    ].join('\r\n');
    const { leads, errors } = parseImportFile('leads.csv', csv);
    expect(leads).toEqual([
      { domain: 'acme.com', address: 'info@acme.com', name: 'Acme, Inc.', location: 'Galloway, NJ', country: 'US', fitReason: 'cert ends "soon"' },
    ]);
    expect(errors.map((e) => e.line)).toEqual([3, 5]);
    expect(errors[0]!.message).toContain('address');
    expect(errors[1]!.message).toContain('fitReason');
  });

  it('reads a JSON array and trims fit_reason to 500 characters', () => {
    const { leads, errors } = parseImportFile(
      'leads.json',
      JSON.stringify([{ domain: 'acme.com', address: 'info@acme.com', fitReason: 'x'.repeat(600) }, { domain: 'acme.com' }]),
    );
    expect(leads[0]!.fitReason).toHaveLength(500);
    expect(errors.map((e) => e.line)).toEqual([2]);
  });

  it('needs domain, address and fit_reason columns', () => {
    expect(() => parseImportFile('leads.csv', 'domain,address\nacme.com,info@acme.com')).toThrow('fit_reason');
  });

  it('parses CSV line breaks inside quotes', () => {
    expect(parseCsv('a,"b\nc"\n1,2')).toEqual([
      ['a', 'b\nc'],
      ['1', '2'],
    ]);
  });
});
