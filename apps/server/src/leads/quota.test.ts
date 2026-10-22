import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { DROP_DAILY_LIMIT_MAX, PLAN_ORDER, PLANS, SEARCH_LIMIT_MAX, emailWeight } from '@nvoke/shared';
import { emailsPerMonth, maxSearchLimit, periodOf } from './plans.js';
import { accountSummary, chargeVerified, emailsVerified, ensureAccount, quotaExhausted, searchQuota } from './quota.js';
import { createSearch } from './repo.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
});

const charge = (user: string, address: string, at?: Date, weight?: number) =>
  db.sql.begin((tx) => chargeVerified(tx, user, address, at, weight));

describe('plans', () => {
  it('match the ladder: 50 free, then 1,000 to 60,000 verified emails a month', () => {
    expect(PLANS.free).toMatchObject({ emailsPerMonth: 50, priceUsd: 0 });
    expect(PLANS.emails_1000).toMatchObject({ emailsPerMonth: 1_000, priceUsd: 9 });
    expect(PLANS.emails_60000).toMatchObject({ emailsPerMonth: 60_000, priceUsd: 199 });
  });

  it('raise the search and drop caps with the plan, never past the schema ceilings', () => {
    let previous = PLANS.free;
    for (const key of PLAN_ORDER) {
      const meta = PLANS[key];
      expect(meta.maxSearchLimit).toBeGreaterThanOrEqual(previous.maxSearchLimit);
      expect(meta.maxDropDailyLimit).toBeGreaterThanOrEqual(previous.maxDropDailyLimit);
      expect(meta.maxSearchLimit).toBeLessThanOrEqual(SEARCH_LIMIT_MAX);
      expect(meta.maxDropDailyLimit).toBeLessThanOrEqual(DROP_DAILY_LIMIT_MAX);
      previous = meta;
    }
    expect(maxSearchLimit('business')).toBe(PLANS.free.maxSearchLimit);
  });

  it('give an unknown plan the free allowance', () => {
    expect(emailsPerMonth('business')).toBe(50);
  });

  it('use UTC calendar months as periods', () => {
    expect(periodOf(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01');
    expect(periodOf(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });
});

describe('quota', () => {
  it('creates the account on first sight with the free plan', async () => {
    expect(await ensureAccount(db.sql, 'u1')).toBe('free');
    await db.sql`update accounts set plan = 'emails_2500' where clerk_user_id = 'u1'`;
    expect(await ensureAccount(db.sql, 'u1')).toBe('emails_2500');
  });

  it('charges each address once, up to the plan allowance', async () => {
    await ensureAccount(db.sql, 'u1');
    for (let i = 0; i < 50; i++) expect(await charge('u1', `a${i}@x.dk`)).toBe('charged');
    // Already paid for: free, even with nothing left.
    expect(await charge('u1', 'a7@x.dk')).toBe('already_billed');
    expect(await charge('u1', 'new@x.dk')).toBe('over_limit');
    expect(await emailsVerified(db.sql, 'u1')).toBe(50);
    expect(await quotaExhausted(db.sql, 'u1')).toBe(true);
  });

  it('counts a Sonar email as three, and refuses one that does not fit', async () => {
    await ensureAccount(db.sql, 'u6');
    const icp = emailWeight('icp');
    expect(icp).toBe(3);
    expect(emailWeight('domains')).toBe(1);
    for (let i = 0; i < 16; i++) expect(await charge('u6', `i${i}@x.dk`, undefined, icp)).toBe('charged');
    expect(await charge('u6', 'one@x.dk')).toBe('charged');
    expect(await emailsVerified(db.sql, 'u6')).toBe(49);
    expect(await charge('u6', 'two@x.dk', undefined, icp)).toBe('over_limit');
    expect(await charge('u6', 'last@x.dk')).toBe('charged');
    expect(await quotaExhausted(db.sql, 'u6')).toBe(true);
  });

  it('never charges an address twice, across months', async () => {
    await ensureAccount(db.sql, 'u1');
    expect(await charge('u1', 'a@x.dk', new Date('2026-09-15T00:00:00Z'))).toBe('charged');
    expect(await charge('u1', 'a@x.dk', new Date('2026-10-15T00:00:00Z'))).toBe('already_billed');
    expect(await emailsVerified(db.sql, 'u1', '2026-10')).toBe(0);
  });

  it('never overshoots under concurrent charges', async () => {
    await ensureAccount(db.sql, 'u2');
    const results = await Promise.all(Array.from({ length: 80 }, (_, i) => charge('u2', `c${i}@x.dk`)));
    expect(results.filter((r) => r === 'charged')).toHaveLength(50);
    expect(await emailsVerified(db.sql, 'u2')).toBe(50);
  });

  it('counts per month and per user', async () => {
    await ensureAccount(db.sql, 'u3');
    await ensureAccount(db.sql, 'u4');
    const sept = new Date('2026-09-15T00:00:00Z');
    for (let i = 0; i < 50; i++) await charge('u3', `m${i}@x.dk`, sept);
    expect(await quotaExhausted(db.sql, 'u3', sept)).toBe(true);
    expect(await quotaExhausted(db.sql, 'u3', new Date('2026-10-01T00:00:00Z'))).toBe(false);
    expect(await quotaExhausted(db.sql, 'u4', sept)).toBe(false);
  });

  it('summarizes plan and usage for /v1/me', async () => {
    const now = new Date('2026-10-13T00:00:00Z');
    await ensureAccount(db.sql, 'u5');
    await db.sql`update accounts set plan = 'emails_25000' where clerk_user_id = 'u5'`;
    for (let i = 0; i < 12; i++) await charge('u5', `s${i}@x.dk`, now);
    expect(await accountSummary(db.sql, 'u5', now)).toEqual({
      userId: 'u5',
      plan: 'emails_25000',
      usage: { period: '2026-10', emailsVerified: 12, emailsLimit: 25_000 },
      maxSearchLimit: 20_000,
      maxDropDailyLimit: 2_500,
      account: { createdBy: 'human', agentName: null, claimedAt: expect.any(String) },
    });
  });

  it('reads what an icp search may still be billed for and what its settled companies gave', async () => {
    const now = new Date('2026-10-13T00:00:00Z');
    await ensureAccount(db.sql, 'u6');
    for (let i = 0; i < 20; i++) await charge('u6', `q${i}@x.dk`, now);
    const search = await createSearch(db.sql, 'u6', { kind: 'icp', params: { description: 'Outbound agencies' } }, 50);
    const company = async (domain: string, crawl: string, fit: string | null, emails: [string | null, string | null][]) => {
      const [c] = await db.sql<{ id: string }[]>`
        insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status, fit_state)
        values (${search.id}, 'u6', ${domain}, ${domain}, ${`https://${domain}/`}, 'test', ${crawl}, ${fit}) returning id`;
      for (const [i, [verification, skipped]] of emails.entries()) {
        await db.sql`
          insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, skipped)
          values (${c!.id}, ${search.id}, 'u6', ${`a${i}@${domain}`}, 'generic', ${verification}, ${skipped})`;
      }
      return c!.id;
    };
    const job = async (type: string, payload: Record<string, string>, status = 'queued') => {
      await db.sql`insert into jobs (type, payload, search_id, status) values (${type}, ${db.sql.json(payload)}, ${search.id}, ${status})`;
    };
    await company('valid.test', 'done', 'kept', [['valid', null], ['valid', null]]);
    await company('none.test', 'done', null, []);
    await company('skipped.test', 'done', null, [[null, 'role_inbox']]);
    // A company with one settled address counts, its open ones aside.
    await company('half.test', 'done', null, [['invalid', null], [null, null]]);
    await company('open.test', 'done', null, [[null, null]]);
    await company('crawling.test', 'pending', null, []);
    await company('waiting.test', 'done', 'pending', [['valid', null]]);
    // A people job yet to make its guessed addresses, or a check still running, leaves a company open.
    await job('people', { companyId: await company('guessing.test', 'done', 'kept', [['invalid', null]]) });
    await company('checking.test', 'done', 'kept', [['invalid', null]]);
    const [checking] = await db.sql<{ id: string }[]>`select id from emails where address = 'a0@checking.test'`;
    await job('verify', { emailId: checking!.id }, 'running');
    // A finished job leaves it settled.
    await job('people', { companyId: await company('guessed.test', 'done', 'kept', [['valid', null]]) }, 'done');
    // 50 free, 20 used: room for 10 icp emails at three each.
    expect(await searchQuota(db.sql, 'u6', search.id, now)).toEqual({ room: 10, settled: 5, valid: 3 });
  });
});
