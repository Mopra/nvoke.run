import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { checkHealth, HEALTH } from './health.js';
import { seedCampaign, seedMailbox, testSecrets } from './test-seed.js';

let db: TestDb;
const secrets = testSecrets();
const NOW = new Date('2026-10-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
});

async function sends(mailboxId: string, n: number, at: Date) {
  for (let i = 0; i < n; i++) {
    await db.sql`
      insert into messages (clerk_user_id, mailbox_id, direction, kind, subject, from_address, to_address, step, at)
      values ('u1', ${mailboxId}, 'out', 'step', 's', 'me@sender.io', ${`r${i}@acme.co.uk`}, 1, ${at})`;
  }
}

async function bounces(mailboxId: string, n: number, at: Date, hard = true) {
  for (let i = 0; i < n; i++) {
    await db.sql`
      insert into messages (clerk_user_id, mailbox_id, direction, kind, subject, from_address, to_address, smtp_response, at)
      values ('u1', ${mailboxId}, 'in', 'bounce', 'Undelivered', 'mailer-daemon@acme.co.uk', 'me@sender.io',
        ${hard ? 'hard 5.1.1' : 'soft 4.2.2'}, ${at})`;
  }
}

async function status(table: 'mailboxes' | 'campaigns', id: string) {
  const [row] = await db.sql<{ status: string }[]>`select status from ${db.sql(table)} where id = ${id}`;
  return row!.status;
}

describe('checkHealth', () => {
  it('pauses at 3% hard bounces over 7 days, and the campaign with no mailbox left', async () => {
    expect(HEALTH).toMatchObject({ windowDays: 7, maxBounceRate: 0.03, minSends: 20 });
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb], { status: 'sending' });
    await sends(mb, 100, daysAgo(1));
    await bounces(mb, 2, daysAgo(1));
    await bounces(mb, 5, daysAgo(1), false);
    await bounces(mb, 5, daysAgo(8));
    expect(await checkHealth(db.sql, mb, NOW)).toEqual({ paused: false, sends: 100, hardBounces: 2 });
    expect(await status('mailboxes', mb)).toBe('active');

    await bounces(mb, 1, daysAgo(2));
    expect(await checkHealth(db.sql, mb, NOW)).toEqual({ paused: true, sends: 100, hardBounces: 3 });
    const [m] = await db.sql<{ status: string; status_reason: string }[]>`select status, status_reason from mailboxes where id = ${mb}`;
    expect(m!.status).toBe('paused');
    expect(m!.status_reason).toBe("Paused: 3 of the last 100 emails bounced (3%). Check the leads' verification before you resume.");
    expect(await status('campaigns', c)).toBe('paused');
  });

  it('says nothing below 20 sends', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    await sends(mb, 19, daysAgo(1));
    await bounces(mb, 5, daysAgo(1));
    expect((await checkHealth(db.sql, mb, NOW)).paused).toBe(false);
  });

  it('keeps a campaign running while another of its mailboxes works', async () => {
    const a = await seedMailbox(db.sql, secrets, { address: 'a@sender.io' });
    const b = await seedMailbox(db.sql, secrets, { address: 'b@sender.io' });
    const c = await seedCampaign(db.sql, [a, b], { status: 'sending' });
    await sends(a, 20, daysAgo(1));
    await bounces(a, 1, daysAgo(1));
    expect((await checkHealth(db.sql, a, NOW)).paused).toBe(true);
    expect(await status('mailboxes', b)).toBe('active');
    expect(await status('campaigns', c)).toBe('sending');
  });
});
