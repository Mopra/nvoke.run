import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { PLANS, periodOf } from './plans.js';
import { accountSummary, commitUsage, emailsUsed, ensureAccount, quotaExhausted, reserveEmails } from './quota.js';

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

describe('plans', () => {
  it('match the spec: 50, 2,000 and 10,000 emails a month', () => {
    expect(PLANS.free.emailsPerMonth).toBe(50);
    expect(PLANS.pro.emailsPerMonth).toBe(2_000);
    expect(PLANS.business.emailsPerMonth).toBe(10_000);
  });

  it('use UTC calendar months as periods', () => {
    expect(periodOf(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01');
    expect(periodOf(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });
});

describe('quota', () => {
  it('creates the account on first sight with the free plan', async () => {
    expect(await ensureAccount(db.sql, 'u1')).toBe('free');
    await db.sql`update accounts set plan = 'pro' where clerk_user_id = 'u1'`;
    expect(await ensureAccount(db.sql, 'u1')).toBe('pro');
  });

  it('grants up to the plan limit and reports when it was exceeded', async () => {
    await ensureAccount(db.sql, 'u1');
    const first = await db.sql.begin(async (tx) => {
      const r = await reserveEmails(tx, 'u1', 30);
      await commitUsage(tx, 'u1', r.granted);
      return r;
    });
    expect(first).toEqual({ granted: 30, exceeded: false });
    const second = await db.sql.begin(async (tx) => {
      const r = await reserveEmails(tx, 'u1', 30);
      await commitUsage(tx, 'u1', r.granted);
      return r;
    });
    expect(second).toEqual({ granted: 20, exceeded: true });
    expect(await emailsUsed(db.sql, 'u1')).toBe(50);
    expect(await quotaExhausted(db.sql, 'u1')).toBe(true);
  });

  it('never overshoots under concurrent reservations', async () => {
    await ensureAccount(db.sql, 'u2');
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        db.sql.begin(async (tx) => {
          const r = await reserveEmails(tx, 'u2', 7);
          await commitUsage(tx, 'u2', r.granted);
          return r.granted;
        }),
      ),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(50);
    expect(await emailsUsed(db.sql, 'u2')).toBe(50);
  });

  it('counts per month and per user', async () => {
    await ensureAccount(db.sql, 'u3');
    await ensureAccount(db.sql, 'u4');
    const sept = new Date('2026-09-15T00:00:00Z');
    await db.sql.begin(async (tx) => {
      await reserveEmails(tx, 'u3', 50, sept);
      await commitUsage(tx, 'u3', 50, sept);
    });
    expect(await quotaExhausted(db.sql, 'u3', sept)).toBe(true);
    expect(await quotaExhausted(db.sql, 'u3', new Date('2026-10-01T00:00:00Z'))).toBe(false);
    expect(await quotaExhausted(db.sql, 'u4', sept)).toBe(false);
  });

  it('summarizes plan and usage for /v1/me', async () => {
    const now = new Date('2026-10-13T00:00:00Z');
    await ensureAccount(db.sql, 'u5');
    await db.sql`update accounts set plan = 'business' where clerk_user_id = 'u5'`;
    await db.sql.begin(async (tx) => {
      await reserveEmails(tx, 'u5', 12, now);
      await commitUsage(tx, 'u5', 12, now);
    });
    expect(await accountSummary(db.sql, 'u5', now)).toEqual({
      userId: 'u5',
      plan: 'business',
      usage: { period: '2026-10', emailsFound: 12, emailsLimit: 10_000 },
      maxSearchLimit: 1_000,
    });
  });
});
