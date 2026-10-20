import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { addressHash } from '../leads/suppression.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import { bareAddress, pollTick, type PollDeps } from './poller.js';
import { sendTick, type SendDeps } from './sender.js';
import type { IncomingMail } from './types.js';
import { seedCampaign, seedEmail, seedLead, seedMailbox, silentLog, testSecrets } from './test-seed.js';

let db: TestDb;
let fake: FakeTransport;
let send: SendDeps;
let poll: PollDeps;
const secrets = testSecrets();
const NOW = new Date('2026-10-20T12:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, suppressions, email_checks cascade`;
  fake = createFakeTransport();
  send = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, publicApiUrl: 'https://api.nvoke.test', enabled: true };
  poll = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, enabled: true };
});

let uid = 0;
function mail(o: Partial<IncomingMail>): IncomingMail {
  uid += 1;
  return {
    folder: 'INBOX',
    uid,
    messageId: `<in-${uid}@acme.co.uk>`,
    inReplyTo: null,
    references: [],
    from: 'jane@acme.co.uk',
    to: ['me@sender.io'],
    subject: 'Re: Subject 1',
    text: 'Sounds interesting, tell me more.',
    headers: {},
    deliveryStatus: null,
    date: later(30),
    ...o,
  };
}

/** One mailbox, one two step campaign, one lead with step 1 sent. */
async function sentLead(address = 'jane@acme.co.uk', emailId: string | null = null) {
  const mb = await seedMailbox(db.sql, secrets);
  const c = await seedCampaign(db.sql, [mb]);
  const l = await seedLead(db.sql, c, mb, { address, emailId });
  await sendTick(send, NOW);
  const sentId = fake.sent[0]!.messageId;
  return { mb, c, l, sentId };
}

async function lead(id: string) {
  const [row] = await db.sql<{ status: string; next_send_at: Date | null }[]>`select status, next_send_at from campaign_leads where id = ${id}`;
  return row!;
}

async function campaign(id: string) {
  const [row] = await db.sql<{ replied: number; bounced: number; opted_out: number }[]>`
    select replied, bounced, opted_out from campaigns where id = ${id}`;
  return row!;
}

describe('pollTick', () => {
  it('a reply in the thread stops the sequence and is kept for Replies', async () => {
    const { mb, c, l, sentId } = await sentLead();
    fake.inbox.push(mail({ inReplyTo: sentId, references: [sentId] }));
    expect(await pollTick(poll, later(5))).toMatchObject({ mailboxes: 1, replies: 1 });
    expect(await lead(l)).toEqual({ status: 'replied', next_send_at: null });
    expect(await campaign(c)).toMatchObject({ replied: 1 });
    const [m] = await db.sql<{ kind: string; body_text: string; campaign_lead_id: string; read_at: Date | null }[]>`
      select kind, body_text, campaign_lead_id, read_at from messages where direction = 'in'`;
    expect(m).toEqual({ kind: 'reply', body_text: 'Sounds interesting, tell me more.', campaign_lead_id: l, read_at: null });

    // Step 2 never goes out, and the poll position was saved.
    await sendTick(send, later(5 * 24 * 60));
    expect(fake.sent).toHaveLength(1);
    const [box] = await db.sql<{ poll_state: Record<string, { lastUid: number }> }[]>`select poll_state from mailboxes where id = ${mb}`;
    expect(box!.poll_state.INBOX!.lastUid).toBe(uid);

    // Read again after a crash: not stored twice, not counted twice.
    await db.sql`update mailboxes set poll_state = '{}'::jsonb where id = ${mb}`;
    expect(await pollTick(poll, later(10))).toMatchObject({ replies: 0, ignored: 1 });
    expect(await campaign(c)).toMatchObject({ replied: 1 });
  });

  it('matches a reply without threading headers by its sender', async () => {
    const { l } = await sentLead();
    fake.inbox.push(mail({ from: 'Jane Doe <Jane@Acme.co.uk>', subject: 'your email' }));
    await pollTick(poll, later(5));
    expect((await lead(l)).status).toBe('replied');
  });

  it('an opt-out reply ends the lead and suppresses the address for this sender', async () => {
    const { c, l, sentId } = await sentLead();
    fake.inbox.push(mail({ inReplyTo: sentId, text: 'Stop\n\nOn Tue someone wrote:\n> Hi Jane' }));
    expect(await pollTick(poll, later(5))).toMatchObject({ optOuts: 1 });
    expect((await lead(l)).status).toBe('opted_out');
    expect(await campaign(c)).toMatchObject({ opted_out: 1, replied: 0 });
    const [s] = await db.sql<{ reason: string; clerk_user_id: string }[]>`
      select reason, clerk_user_id from send_suppressions where hash = ${addressHash('jane@acme.co.uk')}`;
    expect(s).toEqual({ reason: 'unsubscribe', clerk_user_id: 'u1' });
  });

  it('a hard bounce ends the lead, suppresses it and marks the email invalid', async () => {
    const emailId = await seedEmail(db.sql, 'gone@acme.co.uk');
    const { c, l, sentId } = await sentLead('gone@acme.co.uk', emailId);
    fake.inbox.push(
      mail({
        from: 'MAILER-DAEMON@mx.acme.co.uk',
        subject: 'Undelivered Mail Returned to Sender',
        text: 'This is the mail system. Your message could not be delivered.',
        headers: { 'content-type': 'multipart/report; report-type=delivery-status' },
        deliveryStatus: 'Reporting-MTA: dns; mx.acme.co.uk\n\nFinal-Recipient: rfc822; gone@acme.co.uk\nAction: failed\nStatus: 5.1.1\n',
        references: [sentId],
      }),
    );
    expect(await pollTick(poll, later(5))).toMatchObject({ bounces: 1 });
    expect((await lead(l)).status).toBe('bounced');
    expect(await campaign(c)).toMatchObject({ bounced: 1 });
    const [e] = await db.sql<{ verification: string }[]>`select verification from emails where id = ${emailId}`;
    expect(e!.verification).toBe('invalid');
    const [s] = await db.sql<{ reason: string }[]>`select reason from send_suppressions where hash = ${addressHash('gone@acme.co.uk')}`;
    expect(s!.reason).toBe('bounce');
    const [m] = await db.sql<{ kind: string; smtp_response: string; body_text: string | null }[]>`
      select kind, smtp_response, body_text from messages where direction = 'in'`;
    expect(m).toEqual({ kind: 'bounce', smtp_response: 'hard 5.1.1', body_text: null });
  });

  it('an auto reply holds the next step three days and stops nothing', async () => {
    const { l, sentId } = await sentLead();
    const before = (await lead(l)).next_send_at!;
    fake.inbox.push(
      mail({ inReplyTo: sentId, subject: 'Out of office: Subject 1', headers: { 'auto-submitted': 'auto-replied' }, text: 'I am away until Monday.' }),
    );
    expect(await pollTick(poll, later(5))).toMatchObject({ autoReplies: 1 });
    const after = await lead(l);
    expect(after.status).toBe('active');
    expect(after.next_send_at!.getTime()).toBeGreaterThanOrEqual(before.getTime() + 3 * 86_400_000);
  });

  it('leaves mail that matches no lead alone and waits 3 minutes between polls', async () => {
    await sentLead();
    fake.inbox.push(mail({ from: 'friend@elsewhere.org', subject: 'Lunch?' }));
    expect(await pollTick(poll, later(5))).toMatchObject({ mailboxes: 1, ignored: 1 });
    expect(await db.sql`select 1 from messages where direction = 'in'`).toHaveLength(0);
    expect((await pollTick(poll, later(6))).mailboxes).toBe(0);
    expect((await pollTick(poll, later(9))).mailboxes).toBe(1);
  });

  it('reads the bare address', () => {
    expect(bareAddress('Jane <Jane@Acme.com>')).toBe('jane@acme.com');
    expect(bareAddress(' jane@acme.com ')).toBe('jane@acme.com');
  });
});
