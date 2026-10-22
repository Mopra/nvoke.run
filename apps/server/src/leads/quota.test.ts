import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { DROP_DAILY_LIMIT_MAX, PLAN_ORDER, PLANS, SEARCH_LIMIT_MAX, emailWeight } from '@nvoke/shared';
import { emailsPerMonth, maxSearchLimit, periodOf } from './plans.js';
import { accountSummary, chargeVerified, emailsVerified, ensureAccount, quotaExhausted } from './quota.js';

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
});
