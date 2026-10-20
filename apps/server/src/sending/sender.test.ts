import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { addressHash } from '../leads/suppression.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import { replySubject, RETRY_MS, sendTick, type SendDeps } from './sender.js';
import { readUnsubscribe } from './unsubscribe.js';
import { seedCampaign, seedEmail, seedLead, seedMailbox, silentLog, testSecrets } from './test-seed.js';

let db: TestDb;
let fake: FakeTransport;
let deps: SendDeps;
const secrets = testSecrets();
const NOW = new Date('2026-10-20T12:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, suppressions, email_checks cascade`;
  fake = createFakeTransport();
  deps = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, publicApiUrl: 'https://api.nvoke.test/', enabled: true };
});

async function lead(id: string) {
  const [row] = await db.sql<{ status: string; next_step: number; next_send_at: Date | null; thread_message_id: string | null; skip_reason: string | null }[]>`
    select status, next_step, next_send_at, thread_message_id, skip_reason from campaign_leads where id = ${id}`;
  return row!;
}

describe('sendTick', () => {
  it('sends step 1 with the footer and unsubscribe headers, then threads step 2', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });

    expect(await sendTick(deps, NOW)).toMatchObject({ sent: 1 });
    expect(fake.sent).toHaveLength(1);
    const first = fake.sent[0]!;
    expect(first).toMatchObject({ to: 'jane@acme.co.uk', from: 'me@sender.io', subject: 'Subject 1' });
    expect(first.messageId).toMatch(/^<[0-9a-f-]{36}@sender\.io>$/);
    expect(first.inReplyTo).toBeUndefined();
    expect(first.text).toBe("Hi Jane, body 1.\n\nMo\nSender ApS\n\nI found your address on acme.co.uk's website. Reply stop and I will not write again.");
    expect(first.text).not.toMatch(/https?:/);
    expect(first.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const url = /^<https:\/\/api\.nvoke\.test\/u\/(.+)>$/.exec(first.headers['List-Unsubscribe']!);
    const [msg] = await db.sql<{ id: string; message_id: string; step: number }[]>`select id, message_id, step from messages where direction = 'out'`;
    expect(readUnsubscribe(secrets, url![1]!)).toBe(msg!.id);
    expect(msg).toMatchObject({ message_id: first.messageId, step: 1 });

    const after1 = await lead(l);
    expect(after1).toMatchObject({ status: 'active', next_step: 2, thread_message_id: first.messageId });
    expect(after1.next_send_at!.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 3 * 86_400_000);
    const [camp] = await db.sql<{ status: string; sent: number }[]>`select status, sent from campaigns where id = ${c}`;
    expect(camp).toEqual({ status: 'sending', sent: 1 });
    const [usage] = await db.sql<{ period: string; sent: number }[]>`select period, sent from send_usage`;
    expect(usage).toEqual({ period: '2026-10', sent: 1 });

    const later = new Date(after1.next_send_at!.getTime() + 60_000);
    expect(await sendTick(deps, later)).toMatchObject({ sent: 1 });
    const second = fake.sent[1]!;
    expect(second.subject).toBe('Re: Subject 1');
    expect(second.inReplyTo).toBe(first.messageId);
    expect(second.references).toEqual([first.messageId]);
    expect(second.messageId).not.toBe(first.messageId);
    expect(second.text).toContain('body 2.');
    expect(await lead(l)).toMatchObject({ status: 'done', next_send_at: null, thread_message_id: first.messageId });
    const [done] = await db.sql<{ status: string; finished_at: Date | null }[]>`select status, finished_at from campaigns where id = ${c}`;
    expect(done!.status).toBe('done');
  });

  it('claims with skip locked: two ticks at once never send a lead twice or a mailbox twice', async () => {
    const a = await seedMailbox(db.sql, secrets, { address: 'a@sender.io' });
    const b = await seedMailbox(db.sql, secrets, { address: 'b@sender.io' });
    const c = await seedCampaign(db.sql, [a, b]);
    await seedLead(db.sql, c, a, { address: 'one@acme.co.uk' });
    await seedLead(db.sql, c, a, { address: 'two@other.co.uk' });
    await seedLead(db.sql, c, b, { address: 'three@third.co.uk' });

    const [r1, r2] = await Promise.all([sendTick(deps, NOW), sendTick(deps, NOW)]);
    expect(r1.sent + r2.sent).toBe(2);
    expect(fake.sent.map((m) => m.from).sort()).toEqual(['a@sender.io', 'b@sender.io']);
    expect(new Set(fake.sent.map((m) => m.to)).size).toBe(2);
    const [count] = await db.sql<{ n: number }[]>`select count(*)::int as n from messages where direction = 'out'`;
    expect(count!.n).toBe(2);

    // Mailbox a waits out its gap before the next lead.
    expect((await sendTick(deps, minutes(1))).sent).toBe(0);
    expect((await sendTick(deps, minutes(5))).sent).toBe(1);
    expect(fake.sent).toHaveLength(3);
  });

  it('waits for the review window and skips a paused campaign', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    await db.sql`update campaigns set review_until = ${minutes(30)} where id = ${c}`;
    expect((await sendTick(deps, NOW)).sent).toBe(0);
    await db.sql`update campaigns set status = 'paused' where id = ${c}`;
    expect((await sendTick(deps, minutes(31))).sent).toBe(0);
    await db.sql`update campaigns set status = 'sending' where id = ${c}`;
    expect((await sendTick(deps, minutes(31))).sent).toBe(1);
  });

  it('stops suppressed and blocked country leads without sending', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const own = await seedLead(db.sql, c, mb, { address: 'own@acme.co.uk' });
    const dk = await seedLead(db.sql, c, mb, { address: 'jens@firma.dk', country: 'DK', nextSendAt: new Date('2026-01-02T00:00:00Z') });
    await db.sql`insert into send_suppressions (clerk_user_id, hash, reason) values ('u1', ${addressHash('own@acme.co.uk')}, 'manual')`;
    expect(await sendTick(deps, NOW)).toMatchObject({ sent: 0, stopped: 1 });
    expect(await lead(own)).toMatchObject({ status: 'stopped', skip_reason: 'suppressed' });

    expect(await sendTick(deps, NOW)).toMatchObject({ sent: 0, stopped: 1 });
    expect(await lead(dk)).toMatchObject({ status: 'stopped', skip_reason: 'country' });
    expect(fake.sent).toHaveLength(0);
    // Nothing left to send: the list campaign is done.
    const [camp] = await db.sql<{ status: string }[]>`select status from campaigns where id = ${c}`;
    expect(camp!.status).toBe('done');
  });

  it('retries a temporary failure in 15 minutes', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    fake.nextSend.push({ ok: false, kind: 'temporary', response: '451 4.7.1 try later' });
    expect(await sendTick(deps, NOW)).toMatchObject({ retried: 1 });
    expect((await lead(l)).next_send_at!.getTime()).toBe(NOW.getTime() + RETRY_MS);
    expect(fake.sent).toHaveLength(0);
  });

  it('pauses the mailbox and its campaign on an auth failure, keeping the lead', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    fake.nextSend.push({ ok: false, kind: 'auth', response: '535 5.7.8 Username and Password not accepted' });
    await sendTick(deps, NOW);
    const [m] = await db.sql<{ status: string; status_reason: string }[]>`select status, status_reason from mailboxes where id = ${mb}`;
    expect(m!.status).toBe('paused');
    expect(m!.status_reason).toContain('refused the password');
    const [camp] = await db.sql<{ status: string }[]>`select status from campaigns where id = ${c}`;
    expect(camp!.status).toBe('paused');
    expect(await lead(l)).toMatchObject({ status: 'queued', next_step: 1 });
  });

  it('treats a permanent failure as a hard bounce', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const emailId = await seedEmail(db.sql, 'gone@acme.co.uk');
    const l = await seedLead(db.sql, c, mb, { address: 'gone@acme.co.uk', emailId });
    fake.nextSend.push({ ok: false, kind: 'permanent', response: '550 5.1.1 no such user' });
    expect(await sendTick(deps, NOW)).toMatchObject({ bounced: 1 });
    expect((await lead(l)).status).toBe('bounced');
    const [e] = await db.sql<{ verification: string }[]>`select verification from emails where id = ${emailId}`;
    expect(e!.verification).toBe('invalid');
    const [s] = await db.sql<{ reason: string }[]>`select reason from send_suppressions where hash = ${addressHash('gone@acme.co.uk')}`;
    expect(s!.reason).toBe('bounce');
  });

  it('does nothing when sending is off', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    expect((await sendTick({ ...deps, enabled: false }, NOW)).sent).toBe(0);
    expect(fake.sent).toHaveLength(0);
  });

  it('adds Re: once', () => {
    expect(replySubject('Leads for Acme')).toBe('Re: Leads for Acme');
    expect(replySubject('RE: re: Leads')).toBe('Re: Leads');
  });
});
