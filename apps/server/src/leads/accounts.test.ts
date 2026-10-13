import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PlanSource, Resolved } from '../billing/clerk.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { postgresAccounts } from './accounts.js';

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

function source(next: () => Resolved | Error): PlanSource & { calls: number } {
  const s = {
    calls: 0,
    async planOf() {
      s.calls++;
      const r = next();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return s;
}

const silent = { warn: () => undefined, error: () => undefined };

describe('plan sync', () => {
  it('reads the plan from Clerk once, then again only when asked or stale', async () => {
    const clerk = source(() => ({ plan: 'emails_7500', unknownSlugs: [] }));
    const accounts = postgresAccounts(() => db.sql, clerk, silent);
    expect((await accounts.summary('u1')).plan).toBe('emails_7500');
    expect((await accounts.summary('u1')).usage.emailsLimit).toBe(7_500);
    expect(clerk.calls).toBe(1);
    await accounts.summary('u1', { sync: true });
    expect(clerk.calls).toBe(2);
  });

  it('keeps the recorded plan when Clerk fails or reports an unknown slug', async () => {
    let next: Resolved | Error = { plan: 'emails_20000', unknownSlugs: [] };
    const accounts = postgresAccounts(() => db.sql, source(() => next), silent);
    await accounts.summary('u2', { sync: true });

    next = new Error('clerk is down');
    expect((await accounts.summary('u2', { sync: true })).plan).toBe('emails_20000');

    next = { plan: 'free', unknownSlugs: ['emails_20k'] };
    expect((await accounts.summary('u2', { sync: true })).plan).toBe('emails_20000');

    next = { plan: 'free', unknownSlugs: [] };
    expect((await accounts.summary('u2', { sync: true })).plan).toBe('free');
  });

  it('syncPlan ignores users without an account', async () => {
    const clerk = source(() => ({ plan: 'emails_1000', unknownSlugs: [] }));
    await postgresAccounts(() => db.sql, clerk, silent).syncPlan('nobody');
    expect(clerk.calls).toBe(0);
  });
});
