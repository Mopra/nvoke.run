import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { addressHash, domainHash } from '../leads/suppression.js';
import { erase } from './erase.js';
import { exportSubject } from './export.js';
import { parseTarget } from './target.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts, jobs, domains, email_checks, suppressions cascade`;
});

type Row = [address: string, kind: 'generic' | 'personal', verification: string | null];

/** A search for `user` with one company per domain and its emails. Counters match the rows. */
async function seedSearch(sql: TestDb['sql'], user: string, companies: Record<string, Row[]>): Promise<string> {
  await sql`insert into accounts (clerk_user_id) values (${user}) on conflict do nothing`;
  const [s] = await sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit", status) values (${user}, 'local', 10, 'done') returning id`;
  for (const [domain, emails] of Object.entries(companies)) {
    const [c] = await sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status)
      values (${s!.id}, ${user}, ${domain}, ${domain}, ${`https://${domain}/`}, 'test', 'done') returning id`;
    for (const [address, kind, verification] of emails) {
      await sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind, source_url, verification)
        values (${c!.id}, ${s!.id}, ${user}, ${address}, ${kind}, ${`https://${domain}/kontakt`}, ${verification})`;
    }
  }
  await sql`
    update searches s set
      companies_found = (select count(*) from companies where search_id = s.id),
      companies_crawled = (select count(*) from companies where search_id = s.id),
      emails_found = (select count(*) from emails where search_id = s.id),
      emails_valid = (select count(*) from emails where search_id = s.id and verification = 'valid')
    where id = ${s!.id}`;
  return s!.id;
}

async function seedCache(domain: string, addresses: string[]) {
  await db.sql`
    insert into domains (domain, crawl_status, crawled_at, recheck_at)
    values (${domain}, 'done', now(), now() + interval '30 days')`;
  for (const a of addresses) {
    await db.sql`insert into domain_emails (domain, address, source_url) values (${domain}, ${a}, ${`https://${domain}/`})`;
  }
}

async function seedCheck(address: string, user?: string) {
  await db.sql`insert into email_checks (address, verification, mx_host) values (${address}, 'valid', 'mx.example.dk')`;
  if (user) await db.sql`insert into billed_emails (clerk_user_id, address, period) values (${user}, ${address}, '2026-10')`;
}

async function counters(searchId: string) {
  const [s] = await db.sql`
    select companies_found, companies_crawled, emails_found, emails_valid from searches where id = ${searchId}`;
  return s;
}

async function countWhere(address: string) {
  const [r] = await db.sql<{ emails: number; cache: number; checks: number; billed: number }[]>`
    select
      (select count(*)::int from emails where address = ${address}) as emails,
      (select count(*)::int from domain_emails where address = ${address}) as cache,
      (select count(*)::int from email_checks where address = ${address}) as checks,
      (select count(*)::int from billed_emails where address = ${address}) as billed`;
  return r;
}

describe('erase', () => {
  it('erases an address everywhere, suppresses it and recounts the searches', async () => {
    const a = await seedSearch(db.sql, 'alice', {
      'acme.dk': [['info@acme.dk', 'generic', 'valid'], ['jane@acme.dk', 'personal', 'valid']],
    });
    const b = await seedSearch(db.sql, 'bob', { 'acme.dk': [['info@acme.dk', 'generic', 'valid']] });
    await seedCache('acme.dk', ['info@acme.dk', 'kontakt@acme.dk']);
    await seedCheck('info@acme.dk', 'alice');

    const result = await erase(db.sql, { address: ' Info@Acme.dk ' }, 'opt_out_page');

    expect(result).toMatchObject({ target: { address: 'info@acme.dk' }, emails: 2, domainEmails: 1, emailChecks: 1, billedEmails: 1 });
    expect(await countWhere('info@acme.dk')).toEqual({ emails: 0, cache: 0, checks: 0, billed: 0 });
    expect(await countWhere('jane@acme.dk')).toMatchObject({ emails: 1 });
    expect(await countWhere('kontakt@acme.dk')).toMatchObject({ cache: 1 });
    const [sup] = await db.sql`select kind, source from suppressions where hash = ${addressHash('info@acme.dk')}`;
    expect(sup).toEqual({ kind: 'address', source: 'opt_out_page' });
    expect(await counters(a)).toEqual({ companies_found: 1, companies_crawled: 1, emails_found: 1, emails_valid: 1 });
    expect(await counters(b)).toEqual({ companies_found: 1, companies_crawled: 1, emails_found: 0, emails_valid: 0 });
  });

  it('erases a domain with its subdomains, companies and every address on it', async () => {
    const a = await seedSearch(db.sql, 'alice', {
      'shop.acme.dk': [['jane@acme.dk', 'personal', 'valid']],
      'other.dk': [['sales@mail.acme.dk', 'generic', null], ['hej@other.dk', 'generic', 'valid']],
    });
    await seedCache('acme.dk', ['info@acme.dk']);
    await seedCache('other.dk', ['hej@other.dk']);
    await seedCheck('jane@acme.dk', 'alice');
    await seedCheck('hej@other.dk', 'alice');

    const result = await erase(db.sql, { domain: 'https://www.Shop.Acme.dk/kontakt' });

    expect(result.target).toEqual({ domain: 'acme.dk' });
    expect(result).toMatchObject({ companies: 1, domains: 1, emailChecks: 1, billedEmails: 1 });
    const left = await db.sql`select address from emails order by address`;
    expect(left.map((r) => r.address)).toEqual(['hej@other.dk']);
    expect(await db.sql`select domain from companies`).toEqual([{ domain: 'other.dk' }]);
    expect(await db.sql`select domain from domains`).toEqual([{ domain: 'other.dk' }]);
    expect(await countWhere('jane@acme.dk')).toEqual({ emails: 0, cache: 0, checks: 0, billed: 0 });
    expect(await countWhere('hej@other.dk')).toEqual({ emails: 1, cache: 1, checks: 1, billed: 1 });
    const [sup] = await db.sql`select kind, source from suppressions where hash = ${domainHash('acme.dk')}`;
    expect(sup).toEqual({ kind: 'domain', source: 'admin' });
    expect(await counters(a)).toEqual({ companies_found: 1, companies_crawled: 1, emails_found: 1, emails_valid: 1 });
  });

  it('is idempotent and rejects garbage', async () => {
    await erase(db.sql, { address: 'x@acme.dk' });
    await expect(erase(db.sql, { address: 'x@acme.dk' })).resolves.toMatchObject({ emails: 0 });
    await expect(erase(db.sql, { address: 'nope' })).rejects.toThrow();
    await expect(erase(db.sql, { domain: 'localhost' })).rejects.toThrow();
  });

  it('parses targets', () => {
    expect(parseTarget('Jane@Acme.dk')).toEqual({ address: 'jane@acme.dk' });
    expect(parseTarget('www.blog.acme.co.uk')).toEqual({ domain: 'acme.co.uk' });
    expect(parseTarget('not a domain')).toBeNull();
  });
});

describe('exportSubject', () => {
  it('returns everything held about an address', async () => {
    const a = await seedSearch(db.sql, 'alice', { 'acme.dk': [['info@acme.dk', 'generic', 'valid']] });
    await seedSearch(db.sql, 'bob', { 'other.dk': [['jane@acme.dk', 'personal', null]] });
    await seedCache('acme.dk', ['info@acme.dk']);
    await seedCheck('info@acme.dk', 'alice');

    const out = await exportSubject(db.sql, 'INFO@acme.dk');

    expect(out.address).toBe('info@acme.dk');
    expect(out.suppressions).toEqual([]);
    expect(out.cache).toEqual([expect.objectContaining({ domain: 'acme.dk', sourceUrl: 'https://acme.dk/' })]);
    expect(out.searches).toEqual([
      expect.objectContaining({
        searchId: a,
        clerkUserId: 'alice',
        searchKind: 'local',
        entries: [expect.objectContaining({ company: 'acme.dk', kind: 'generic', sourceUrl: 'https://acme.dk/kontakt', verification: 'valid' })],
      }),
    ]);
    expect(out.verification).toMatchObject({ verification: 'valid', mxHost: 'mx.example.dk' });
    expect(out.billing).toEqual([expect.objectContaining({ clerkUserId: 'alice', period: '2026-10' })]);
  });

  it('shows the suppression and nothing else after an erase', async () => {
    await seedSearch(db.sql, 'alice', { 'acme.dk': [['info@acme.dk', 'generic', 'valid']] });
    await erase(db.sql, { domain: 'acme.dk' }, 'email');
    const out = await exportSubject(db.sql, 'info@acme.dk');
    expect(out.suppressions).toEqual([expect.objectContaining({ kind: 'domain', source: 'email' })]);
    expect(out).toMatchObject({ cache: [], searches: [], verification: null, billing: [] });
  });
});
