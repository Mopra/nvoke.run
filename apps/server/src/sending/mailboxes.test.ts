import { randomBytes } from 'node:crypto';
import type { ConnectMailboxRequest } from '@nvoke/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecrets } from '../crypto/secrets.js';
import { ensureAccount } from '../leads/quota.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import { seedCampaign, seedLead } from './test-seed.js';
import { SIGN_IN_AGAIN, signState, type MicrosoftOAuth } from './oauth.js';
import {
  checkMailbox,
  checkReason,
  connectMailbox,
  connectMicrosoftMailbox,
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
    expect(credentialsFor(deps, r)).toMatchObject({ password: 'abcd efgh ijkl mnop', smtpSecure: true, displayName: 'Mia Acme' });
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

describe('sign in with Microsoft', () => {
  const idToken = (claims: Record<string, unknown>) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
  /** A token endpoint that signs in the given address every time. */
  const microsoft = (address = 'mia@acme.io', status = 200): MicrosoftOAuth => ({
    clientId: 'client-1',
    clientSecret: 'shh',
    redirectUri: 'https://nvoke.run/app/mailboxes/callback',
    fetch: (async () =>
      new Response(
        JSON.stringify(
          status === 200
            ? { access_token: 'at', refresh_token: 'refresh-token-plain', expires_in: 3600, id_token: idToken({ preferred_username: address, name: 'Mia Acme' }) }
            : { error: 'invalid_grant' },
        ),
        { status },
      )) as unknown as typeof fetch,
  });

  it('connects the mailbox that signed in, with its tokens sealed', async () => {
    const d = { ...deps, microsoft: microsoft() };
    const m = await connectMicrosoftMailbox(d, 'u1', 'code', signState(secrets, 'u1'));
    expect(m).toMatchObject({ address: 'mia@acme.io', displayName: 'Mia Acme', provider: 'microsoft', smtpHost: 'smtp.office365.com', smtpPort: 587, status: 'checking' });
    const r = await settled(m.id);
    expect(r.status).toBe('active');
    expect(r.secret).not.toContain('refresh-token-plain');
    const creds = credentialsFor(d, r);
    expect(creds.password).toBe('');
    expect(await creds.accessToken!()).toBe('at');
  });

  it('resumes a mailbox paused for a refused login, and keeps one the user paused', async () => {
    const d = { ...deps, microsoft: microsoft() };
    const m = await connectMicrosoftMailbox(d, 'u1', 'code', signState(secrets, 'u1'));
    await settled(m.id);
    await db.sql`update mailboxes set status = 'paused', status_reason = 'Paused: Microsoft refused the sign-in.' where id = ${m.id}`;
    await connectMicrosoftMailbox(d, 'u1', 'code', signState(secrets, 'u1'));
    expect((await settled(m.id)).status).toBe('active');
    await updateMailbox(d, 'u1', m.id, { status: 'paused' });
    await connectMicrosoftMailbox(d, 'u1', 'code', signState(secrets, 'u1'));
    expect((await row(m.id)).status).toBe('paused');
  });

  it('moves a password mailbox to the sign-in and keeps its settings', async () => {
    const old = await connectMailbox(deps, 'u1', req());
    await settled(old.id);
    await updateMailbox(deps, 'u1', old.id, { dailyCap: 12 });
    const m = await connectMicrosoftMailbox({ ...deps, microsoft: microsoft() }, 'u1', 'code', signState(secrets, 'u1'));
    expect(m).toMatchObject({ id: old.id, provider: 'microsoft', dailyCap: 12 });
    await expect(updateMailbox(deps, 'u1', m.id, { password: 'x' })).rejects.toMatchObject({ code: 'password_not_used' });
  });

  it('refuses a state from another user, a refused code, and a server without the app', async () => {
    await expect(connectMicrosoftMailbox({ ...deps, microsoft: microsoft() }, 'u1', 'code', signState(secrets, 'u2'))).rejects.toMatchObject({ code: 'oauth_failed' });
    await expect(connectMicrosoftMailbox({ ...deps, microsoft: microsoft('x', 400) }, 'u1', 'code', signState(secrets, 'u1'))).rejects.toMatchObject({ code: 'oauth_failed' });
    await expect(connectMicrosoftMailbox(deps, 'u1', 'code', signState(secrets, 'u1'))).rejects.toMatchObject({ code: 'oauth_unavailable' });
    expect(await listMailboxes(db.sql, 'u1')).toEqual([]);
  });

  it('says which switch the admin must turn on, or to sign in again', () => {
    const ms = { smtp_host: 'smtp.office365.com', smtp_port: 587, imap_host: 'outlook.office365.com', imap_port: 993, provider: 'microsoft' as const };
    expect(checkReason(ms, { ok: false, step: 'smtp', kind: 'auth', message: '535 5.7.139' })).toMatch(/Authenticated SMTP/);
    expect(checkReason(ms, { ok: false, step: 'smtp', kind: 'auth', message: SIGN_IN_AGAIN })).toMatch(/Sign in with Microsoft again/);
  });
});

describe('check reasons', () => {
  const hosts = { smtp_host: 'mail.example.org', smtp_port: 587, imap_host: 'imap.example.org', imap_port: 993 };
  it('names the provider fix, the host and port, or the server words', () => {
    expect(checkReason({ ...hosts, smtp_host: 'smtp.office365.com' }, { ok: false, step: 'smtp', kind: 'auth', message: '' })).toMatch(/^Microsoft refused/);
    expect(checkReason(hosts, { ok: false, step: 'imap', kind: 'auth', message: '' })).toMatch(/^The IMAP server refused/);
    expect(checkReason(hosts, { ok: false, step: 'smtp', kind: 'connect', message: '' })).toBe('Could not reach mail.example.org on port 587. Check the SMTP host and port.');
    expect(checkReason(hosts, { ok: false, step: 'smtp', kind: 'tls', message: '' })).toMatch(/465 uses TLS/);
  });

  it('never echoes what the server said', () => {
    const banner = '220 PostgreSQL 17.2 on x86_64-pc-linux-gnu ready';
    const other = checkReason(hosts, { ok: false, step: 'imap', kind: 'other', message: banner });
    expect(other).toBe('The IMAP server did not accept the check. Check the IMAP host, port and username, then try again.');
    for (const kind of ['connect', 'tls', 'auth'] as const) {
      expect(checkReason(hosts, { ok: false, step: 'smtp', kind, message: banner })).not.toContain('PostgreSQL');
    }
    expect(checkReason({ ...hosts, smtp_host: '127.0.0.1' }, { ok: false, step: 'smtp', kind: 'connect', message: 'private address' })).toBe(
      "127.0.0.1 is not a public address. Use your provider's SMTP server.",
    );
    expect(checkReason({ ...hosts, imap_port: 5432 }, { ok: false, step: 'imap', kind: 'connect', message: 'port not allowed' })).toBe('Port 5432 is not a mail port. IMAP runs on 993 or 143.');
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
    expect(credentialsFor(deps, r).password).toBe('new pass');

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

describe('delete with campaigns', () => {
  const active = async (address: string) => {
    const m = await connectMailbox(deps, 'u1', req({ address }));
    await settled(m.id);
    return m.id;
  };
  const lead = (id: string) =>
    db.sql<{ mailbox_id: string | null; status: string; skip_reason: string | null }[]>`
      select mailbox_id, status, skip_reason from campaign_leads where id = ${id}`.then((r) => r[0]!);
  const campaign = (id: string) => db.sql<{ status: string }[]>`select status from campaigns where id = ${id}`.then((r) => r[0]!.status);

  it('moves unsent leads to the mailbox with the fewest and stops threads under way', async () => {
    const [a, b, c] = [await active('a@acme.io'), await active('b@acme.io'), await active('c@acme.io')];
    const camp = await seedCampaign(db.sql, [a, b, c]);
    const fresh = [];
    for (let i = 0; i < 4; i++) fresh.push(await seedLead(db.sql, camp, a, { address: `new${i}@beta.io` }));
    const sent = await seedLead(db.sql, camp, a, { address: 'mid@beta.io' });
    await db.sql`update campaign_leads set status = 'active', next_step = 2, thread_message_id = '<t1@acme.io>' where id = ${sent}`;
    await seedLead(db.sql, camp, b, { address: 'onb@beta.io' });
    await seedLead(db.sql, camp, b, { address: 'onb2@beta.io' });

    expect(await deleteMailbox(db.sql, 'u1', a)).toBe(true);

    const moved = await Promise.all(fresh.map(lead));
    expect(moved.every((l) => l.status === 'queued' && (l.mailbox_id === b || l.mailbox_id === c))).toBe(true);
    // b had 2, c had 0: c takes three, then they are level and b takes the last.
    expect(moved.filter((l) => l.mailbox_id === c)).toHaveLength(3);
    expect(await lead(sent)).toEqual({ mailbox_id: null, status: 'stopped', skip_reason: 'mailbox_deleted' });
    expect(await campaign(camp)).toBe('scheduled');
  });

  it('prefers a working mailbox and pauses a campaign left with none', async () => {
    const [a, b] = [await active('a@acme.io'), await active('b@acme.io')];
    await db.sql`update mailboxes set status = 'paused' where id = ${b}`;
    const camp = await seedCampaign(db.sql, [a, b]);
    const l = await seedLead(db.sql, camp, a, { address: 'new@beta.io' });

    await deleteMailbox(db.sql, 'u1', a);
    // Only a paused mailbox is left: the lead waits there and the campaign pauses.
    expect(await lead(l)).toMatchObject({ mailbox_id: b, status: 'queued' });
    expect(await campaign(camp)).toBe('paused');
  });

  it('finishes a list campaign with nothing left', async () => {
    const a = await active('a@acme.io');
    const camp = await seedCampaign(db.sql, [a], { status: 'sending' });
    const l = await seedLead(db.sql, camp, a, { address: 'mid@beta.io' });
    await db.sql`update campaign_leads set status = 'active', thread_message_id = '<t1@acme.io>' where id = ${l}`;

    await deleteMailbox(db.sql, 'u1', a);
    expect(await lead(l)).toMatchObject({ status: 'stopped', skip_reason: 'mailbox_deleted' });
    expect(await campaign(camp)).toBe('done');
  });

  it('pauses a campaign whose only mailbox goes, with unsent leads waiting', async () => {
    const a = await active('a@acme.io');
    const camp = await seedCampaign(db.sql, [a], { status: 'sending' });
    const l = await seedLead(db.sql, camp, a, { address: 'new@beta.io' });

    await deleteMailbox(db.sql, 'u1', a);
    expect(await lead(l)).toMatchObject({ mailbox_id: null, status: 'queued' });
    expect(await campaign(camp)).toBe('paused');
  });
});
