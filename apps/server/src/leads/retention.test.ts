import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { ensureAccount } from './quota.js';
import { purge, recheckAt, RETENTION } from './retention.js';
import { addressHash } from './suppression.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, email_checks, suppressions, domains cascade`;
});

const NOW = new Date('2026-10-13T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

async function searchWithEmail(createdAt: string, address: string): Promise<string> {
  const [search] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit", created_at) values ('u1', 'local', 10, ${createdAt}) returning id`;
  const [company] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source)
    values (${search!.id}, 'u1', 'Acme', 'acme.dk', 'https://acme.dk/', 'test') returning id`;
  await db.sql`
    insert into emails (company_id, search_id, clerk_user_id, address, kind)
    values (${company!.id}, ${search!.id}, 'u1', ${address}, 'generic')`;
  return search!.id;
}

describe('retention', () => {
  it('rechecks done domains after 90 days and failed or blocked ones after 7', () => {
    expect(RETENTION).toMatchObject({ domainRecheckDays: 90, domainRecheckFailedDays: 7, domainEmailMonths: 12, searchMonths: 12, emailCheckDays: 30, billedEmailMonths: 12 });
    expect(recheckAt('done', NOW).toISOString()).toBe('2027-01-11T12:00:00.000Z');
    expect(recheckAt('failed', NOW).toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(recheckAt('blocked', NOW).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('deletes each kind of row past its retention period and nothing else', async () => {
    await ensureAccount(db.sql, 'u1');
    const oldSearch = await searchWithEmail('2025-10-12T12:00:00Z', 'old@acme.dk');
    const newSearch = await searchWithEmail('2025-10-14T12:00:00Z', 'new@acme.dk');

    await db.sql`
      insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at) values
        ('acme.dk', 'done', ${daysAgo(10)}, false, ${daysAgo(-80)}),
        ('gone.dk', 'done', '2025-07-01T00:00:00Z', false, '2025-09-29T00:00:00Z')`;
    // first_seen decides, however recently the address was seen again.
    await db.sql`
      insert into domain_emails (domain, address, first_seen, last_seen) values
        ('acme.dk', 'info@acme.dk', '2025-10-12T12:00:00Z', ${daysAgo(1)}),
        ('acme.dk', 'salg@acme.dk', '2025-10-14T12:00:00Z', ${daysAgo(1)})`;
    await db.sql`
      insert into email_checks (address, verification, checked_at) values
        ('stale@acme.dk', 'valid', ${daysAgo(31)}),
        ('fresh@acme.dk', 'valid', ${daysAgo(29)})`;
    await db.sql`
      insert into billed_emails (clerk_user_id, address, period, billed_at) values
        ('u1', 'old@acme.dk', '2025-10', '2025-10-12T12:00:00Z'),
        ('u1', 'new@acme.dk', '2025-10', '2025-10-14T12:00:00Z')`;
    await db.sql`
      insert into suppressions (hash, kind, created_at) values (${addressHash('x@acme.dk')}, 'address', '2020-01-01T00:00:00Z')`;

    const result = await purge(db.sql, NOW);
    expect(result).toEqual({ searches: 1, domainEmails: 1, domains: 1, emailChecks: 1, billedEmails: 1, webSearchPages: 0, feedItems: 0, webhookDeliveries: 0, replyBodies: 0, messages: 0, writtenSteps: 0 });

    const searches = await db.sql`select id from searches`;
    expect(searches).toEqual([{ id: newSearch }]);
    const emails = await db.sql`select address from emails`;
    expect(emails).toEqual([{ address: 'new@acme.dk' }]);
    expect(await db.sql`select 1 from companies where search_id = ${oldSearch}`).toHaveLength(0);
    expect(await db.sql`select domain from domains`).toEqual([{ domain: 'acme.dk' }]);
    expect(await db.sql`select address from domain_emails`).toEqual([{ address: 'salg@acme.dk' }]);
    expect(await db.sql`select address from email_checks`).toEqual([{ address: 'fresh@acme.dk' }]);
    expect(await db.sql`select address from billed_emails`).toEqual([{ address: 'new@acme.dk' }]);
    expect(await db.sql`select kind from suppressions`).toEqual([{ kind: 'address' }]);

    // Running again finds nothing more to delete.
    expect(await purge(db.sql, NOW)).toEqual({ searches: 0, domainEmails: 0, domains: 0, emailChecks: 0, billedEmails: 0, webSearchPages: 0, feedItems: 0, webhookDeliveries: 0, replyBodies: 0, messages: 0, writtenSteps: 0 });
  });
});
