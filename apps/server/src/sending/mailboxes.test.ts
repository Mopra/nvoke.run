import { randomBytes } from 'node:crypto';
import type { ConnectMailboxRequest } from '@nvoke/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecrets } from '../crypto/secrets.js';
import { ensureAccount } from '../leads/quota.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import {
  checkMailbox,
  checkReason,
  connectMailbox,
  credentialsFor,
  deleteMailbox,
  listMailboxes,
  MailboxError,
  updateMailbox,
  type MailboxDeps,
  type MailboxRow,
} from './mailboxes.js';

let db: TestDb;
let fake: FakeTransport;
let deps: MailboxDeps;
const secrets = createSecrets(randomBytes(32).toString('base64'));

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await ensureAccount(db.sql, 'u1');
  await ensureAccount(db.sql, 'u2');
  fake = createFakeTransport();
  deps = { sql: db.sql, secrets, transport: fake.factory, log: silentLog };
});

const req = (over: Partial<ConnectMailboxRequest> = {}): ConnectMailboxRequest => ({
  address: 'mia@acme.io',
  displayName: 'Mia Acme',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  password: 'abcd efgh ijkl mnop',
  ...over,
});

const row = async (id: string) => (await db.sql<MailboxRow[]>`select * from mailboxes where id = ${id}`)[0]!;

/** connectMailbox starts the check without waiting; wait for it to settle. */
async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const r = await row(id);
    if (r.status !== 'checking') return r;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('check never finished');
}

describe('connect', () => {
  it('seals the password, returns checking and turns active after the check', async () => {
    const m = await connectMailbox(deps, 'u1', req());
    expect(m).toMatchObject({ address: 'mia@acme.io', status: 'checking', username: 'mia@acme.io', dailyCap: 30, warm: false, sentToday: 0 });
    const r = await row(m.id);
    expect(r.secret).not.toContain('abcd');
    expect(r.smtp_secure).toBe(true);
    expect(credentialsFor(secrets, r)).toMatchObject({ password: 'abcd efgh ijkl mnop', smtpSecure: true, displayName: 'Mia Acme' });
    expect((await settled(m.id)).status).toBe('active');
    expect(fake.opened).toEqual(['mia@acme.io']);
  });

  it('uses STARTTLS on 587 and keeps a given username', async () => {
    const m = await connectMailbox(deps, 'u1', req({ smtpHost: 'SMTP.Office365.com', smtpPort: 587, username: 'mia' }));
    const r = await settled(m.id);
    expect(r).toMatchObject({ smtp_secure: false, smtp_host: 'smtp.office365.com', username: 'mia' });
  });

  it('refuses the same address twice and more than the limit', async () => {
    await connectMailbox(deps, 'u1', req());
    await expect(connectMailbox(deps, 'u1', req())).rejects.toMatchObject({ code: 'exists' });
    // Another user may connect the same address.
    await expect(connectMailbox(deps, 'u2', req())).resolves.toMatchObject({ address: 'mia@acme.io' });

    for (let i = 1; i < 20; i++) await connectMailbox(deps, 'u1', req({ address: `m${i}@acme.io` }));
    const err = await connectMailbox(deps, 'u1', req({ address: 'one-more@acme.io' })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailboxError);
    expect(err).toMatchObject({ code: 'too_many_mailboxes' });
  });

  it('sets error with a reason the user can act on', async () => {
    fake.checkResult = { ok: false, step: 'smtp', kind: 'auth', message: '535 5.7.8 Username and Password not accepted' };
    const m = await connectMailbox(deps, 'u1', req());
    const r = await settled(m.id);
    expect(r.status).toBe('error');
    expect(r.status_reason).toBe('Google refused the password. Use an app password (myaccount.google.com/apppasswords).');
  });

  it('says so when the sealed password no longer opens', async () => {
    const m = await connectMailbox(deps, 'u1', req());
    await settled(m.id);
    await db.sql`update mailboxes set status = 'checking' where id = ${m.id}`;
    const other = { ...deps, secrets: createSecrets(randomBytes(32).toString('base64')) };
    await checkMailbox(other, m.id);
    expect((await row(m.id)).status_reason).toMatch(/no longer opens/);
  });
});

describe('check reasons', () => {
  const hosts = { smtp_host: 'mail.example.org', smtp_port: 587, imap_host: 'imap.example.org', imap_port: 993 };
  it('names the provider fix, the host and port, or the server words', () => {
    expect(checkReason({ ...hosts, smtp_host: 'smtp.office365.com' }, { ok: false, step: 'smtp', kind: 'auth', message: '' })).toMatch(/^Microsoft refused/);
    expect(checkReason(hosts, { ok: false, step: 'imap', kind: 'auth', message: '' })).toMatch(/^The IMAP server refused/);
    expect(checkReason(hosts, { ok: false, step: 'smtp', kind: 'connect', message: '' })).toBe('Could not reach mail.example.org on port 587. Check the SMTP host and port.');
    expect(checkReason(hosts, { ok: false, step: 'smtp', kind: 'tls', message: '' })).toMatch(/465 uses TLS/);
    expect(checkReason(hosts, { ok: false, step: 'imap', kind: 'other', message: 'BYE too many connections' })).toBe('The IMAP server said: BYE too many connections');
  });
});

describe('list', () => {
  it('counts sends in the last 24 hours and gives today\'s capacity, per user', async () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const m = await connectMailbox(deps, 'u1', req({ warm: true, dailyCap: 10 }));
    await settled(m.id);
    for (const at of ['2026-10-20T11:00:00Z', '2026-10-19T13:00:00Z', '2026-10-19T11:00:00Z']) {
      await db.sql`
        insert into messages (clerk_user_id, mailbox_id, direction, kind, from_address, to_address, at)
        values ('u1', ${m.id}, 'out', 'step', 'mia@acme.io', 'ben@beta.io', ${new Date(at)})`;
    }
    await db.sql`
      insert into messages (clerk_user_id, mailbox_id, direction, kind, from_address, to_address, at)
      values ('u1', ${m.id}, 'in', 'reply', 'ben@beta.io', 'mia@acme.io', ${now})`;
    const [got] = await listMailboxes(db.sql, 'u1', now);
    expect(got).toMatchObject({ id: m.id, status: 'active', sentToday: 2, capacityToday: 8 });
    expect(await listMailboxes(db.sql, 'u2', now)).toEqual([]);
  });

  it('ramps a cold mailbox', async () => {
    const m = await connectMailbox(deps, 'u1', req());
    await settled(m.id);
    const [got] = await listMailboxes(db.sql, 'u1', new Date((await row(m.id)).ramp_started_at.getTime() + 3_600_000));
    expect(got!.capacityToday).toBe(5);
  });
});

describe('update and delete', () => {
  it('edits fields, pauses, and checks again on a new password or a resume', async () => {
    const m = await connectMailbox(deps, 'u1', req());
    await settled(m.id);

    const edited = await updateMailbox(deps, 'u1', m.id, { displayName: 'Mia', dailyCap: 12, signature: 'Mia\nAcme' });
    expect(edited).toMatchObject({ displayName: 'Mia', dailyCap: 12, signature: 'Mia\nAcme', status: 'active' });

    expect(await updateMailbox(deps, 'u1', m.id, { status: 'paused' })).toMatchObject({ status: 'paused' });
    expect(await updateMailbox(deps, 'u1', m.id, { status: 'active' })).toMatchObject({ status: 'checking' });
    expect((await settled(m.id)).status).toBe('active');

    fake.checkResult = { ok: false, step: 'imap', kind: 'auth', message: 'no' };
    expect(await updateMailbox(deps, 'u1', m.id, { password: 'new pass' })).toMatchObject({ status: 'checking' });
    const r = await settled(m.id);
    expect(r.status).toBe('error');
    expect(credentialsFor(secrets, r).password).toBe('new pass');

    expect(await updateMailbox(deps, 'u2', m.id, { displayName: 'x' })).toBeNull();
  });

  it('restarts the ramp when a warm mailbox goes back to cold', async () => {
    const m = await connectMailbox(deps, 'u1', req({ warm: true }));
    await settled(m.id);
    await db.sql`update mailboxes set ramp_started_at = '2026-01-01' where id = ${m.id}`;
    await updateMailbox(deps, 'u1', m.id, { warm: false });
    expect((await row(m.id)).ramp_started_at.getTime()).toBeGreaterThan(new Date('2026-06-01').getTime());
  });

  it('deletes only the user\'s own', async () => {
    const m = await connectMailbox(deps, 'u1', req());
    await settled(m.id);
    expect(await deleteMailbox(db.sql, 'u2', m.id)).toBe(false);
    expect(await deleteMailbox(db.sql, 'u1', m.id)).toBe(true);
    expect(await listMailboxes(db.sql, 'u1')).toEqual([]);
  });
});
