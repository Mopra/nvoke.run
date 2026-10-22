import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Verification } from '@nvoke/shared';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { RECHECK_FIRST_MS, RECHECK_MAX, recheckUnknown } from './recheck.js';
import type { VerifyResult } from './index.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs cascade`;
});

const HOUR = 60 * 60_000;
const NOW = new Date('2026-10-22T12:00:00Z');

/** A verifier that answers from a script and records what it was asked. No network. */
function scriptedVerifier(answers: Record<string, Partial<VerifyResult> & { verification: Verification }>) {
  const asked: string[] = [];
  return {
    asked,
    verifier: {
      async verify(address: string): Promise<VerifyResult> {
        asked.push(address);
        const a = answers[address] ?? { verification: 'unknown', reason: 'rcpt_tempfail_451' };
        return { address, mxHost: 'mx.test', reason: 'rcpt_accepted', ...a };
      },
    },
  };
}

/** One search with one company and its emails, each settled unknown `settledAgoMs` before NOW. */
async function seed(opts: { kind?: string; status?: string; plan?: string; emails: string[]; settledAgoMs?: number; createdAgoMs?: number }) {
  await db.sql`insert into accounts (clerk_user_id, plan) values ('u1', ${opts.plan ?? 'emails_1000'}) on conflict do nothing`;
  const [search] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit", status) values ('u1', ${opts.kind ?? 'local'}, 10, ${opts.status ?? 'done'}) returning id
  `;
  const [company] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status)
    values (${search!.id}, 'u1', 'Acme', 'acme.dk', 'https://acme.dk', 'test', 'done') returning id
  `;
  const settled = new Date(NOW.getTime() - (opts.settledAgoMs ?? 3 * HOUR));
  const created = new Date(NOW.getTime() - (opts.createdAgoMs ?? 4 * HOUR));
  for (const address of opts.emails) {
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, checked_at, created_at)
      values (${company!.id}, ${search!.id}, 'u1', ${address}, 'generic', 'unknown', ${settled}, ${created})
    `;
  }
  return search!.id;
}

const row = async (address: string) =>
  (await db.sql<{ verification: string; unknown_rechecks: number; rechecked_at: Date | null }[]>`
    select verification, unknown_rechecks, rechecked_at from emails where address = ${address}
  `)[0]!;

describe('recheckUnknown', () => {
  it('asks settled unknowns again, records verdicts and charges a valid one', async () => {
    const searchId = await seed({ kind: 'icp', emails: ['anna@acme.dk', 'bo@acme.dk', 'info@acme.dk'] });
    const { verifier, asked } = scriptedVerifier({
      'anna@acme.dk': { verification: 'valid' },
      'bo@acme.dk': { verification: 'invalid', reason: 'rcpt_rejected_550' },
    });
    const out = await recheckUnknown({ sql: db.sql, verifier, now: () => NOW });
    expect(asked.sort()).toEqual(['anna@acme.dk', 'bo@acme.dk', 'info@acme.dk']);
    expect(out).toMatchObject({ busy: false, asked: 3, settled: { valid: 1, invalid: 1 }, stillUnknown: 1, paced: false });
    expect(await row('anna@acme.dk')).toMatchObject({ verification: 'valid', unknown_rechecks: 1 });
    expect(await row('bo@acme.dk')).toMatchObject({ verification: 'invalid' });
    expect(await row('info@acme.dk')).toMatchObject({ verification: 'unknown', unknown_rechecks: 1 });
    // A Sonar email counts three, and the search shows one more valid.
    const [usage] = await db.sql<{ emails_verified: number }[]>`select emails_verified from usage where clerk_user_id = 'u1'`;
    expect(usage?.emails_verified).toBe(3);
    const [search] = await db.sql<{ emails_valid: number }[]>`select emails_valid from searches where id = ${searchId}`;
    expect(search?.emails_valid).toBe(1);
  });

  it('waits longer after each look and stops after the last one', async () => {
    await seed({ emails: ['info@acme.dk'] });
    const { verifier, asked } = scriptedVerifier({});
    let t = NOW.getTime();
    const tick = () => recheckUnknown({ sql: db.sql, verifier, now: () => new Date(t) });
    expect((await tick()).asked).toBe(1);
    // Too soon for the second look (it waits twice as long as the first).
    t += RECHECK_FIRST_MS;
    expect((await tick()).asked).toBe(0);
    t += RECHECK_FIRST_MS + 1;
    expect((await tick()).asked).toBe(1);
    t += 4 * RECHECK_FIRST_MS + 1;
    expect((await tick()).asked).toBe(1);
    t += 100 * RECHECK_FIRST_MS;
    expect((await tick()).asked).toBe(0);
    expect(asked).toHaveLength(RECHECK_MAX);
  });

  it('leaves fresh, old and canceled unknowns alone, and yields to due verify jobs', async () => {
    await seed({ emails: ['fresh@acme.dk'], settledAgoMs: HOUR });
    await seed({ emails: ['old@acme.dk'], createdAgoMs: 8 * 24 * HOUR });
    await seed({ emails: ['gone@acme.dk'], status: 'canceled' });
    const { verifier, asked } = scriptedVerifier({});
    expect((await recheckUnknown({ sql: db.sql, verifier, now: () => NOW })).asked).toBe(0);

    await seed({ emails: ['due@acme.dk'] });
    await db.sql`insert into jobs (type, payload, run_after) values ('verify', '{}', ${new Date(NOW.getTime() - 1_000)})`;
    expect(await recheckUnknown({ sql: db.sql, verifier, now: () => NOW })).toMatchObject({ busy: true, asked: 0 });
    expect(asked).toEqual([]);
  });

  it('stops at the first check no lane can take, counting nothing', async () => {
    await seed({ emails: ['a@acme.dk', 'b@acme.dk'] });
    const { verifier, asked } = scriptedVerifier({
      'a@acme.dk': { verification: 'unknown', reason: 'smtp_paced', retryAfterMs: 30_000 },
      'b@acme.dk': { verification: 'unknown', reason: 'smtp_paced', retryAfterMs: 30_000 },
    });
    const out = await recheckUnknown({ sql: db.sql, verifier, now: () => NOW });
    expect(out).toMatchObject({ paced: true, asked: 0 });
    expect(asked).toHaveLength(1);
    expect(await row('a@acme.dk')).toMatchObject({ unknown_rechecks: 0, rechecked_at: null });
  });

  it('leaves a valid address unknown and uncharged when the allowance is spent', async () => {
    await seed({ plan: 'free', emails: ['anna@acme.dk'] });
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('u1', '2026-10', 50)`;
    const { verifier } = scriptedVerifier({ 'anna@acme.dk': { verification: 'valid' } });
    expect(await recheckUnknown({ sql: db.sql, verifier, now: () => NOW })).toMatchObject({ overLimit: 1, settled: {} });
    expect(await row('anna@acme.dk')).toMatchObject({ verification: 'unknown', unknown_rechecks: 1 });
  });
});
