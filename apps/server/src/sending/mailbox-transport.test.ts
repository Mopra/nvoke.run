import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailboxCredentials } from './types.js';

// IMAP goes through a scripted stand in for ImapFlow: the folder list, each
// folder's UIDVALIDITY and messages, and whether login fails.
interface FakeFolder {
  uidValidity: number;
  messages: { uid: number; source: string; date: Date }[];
}
const imap = vi.hoisted(() => ({
  folders: {} as Record<string, FakeFolder>,
  list: [] as { path: string; specialUse?: string }[],
  connectError: null as Error | null,
  fetched: [] as string[],
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    mailbox: { uidValidity: bigint; uidNext: number } | false = false;
    private open = '';
    async connect() {
      if (imap.connectError) throw imap.connectError;
    }
    async list() {
      return imap.list;
    }
    async getMailboxLock(path: string) {
      const f = imap.folders[path]!;
      this.open = path;
      this.mailbox = { uidValidity: BigInt(f.uidValidity), uidNext: Math.max(0, ...f.messages.map((m) => m.uid)) + 1 };
      return { path, release: () => {} };
    }
    async search(q: { since?: Date; uid?: string }) {
      const f = imap.folders[this.open]!;
      if (q.since) return f.messages.filter((m) => m.date >= q.since!).map((m) => m.uid);
      const from = Number(q.uid!.split(':')[0]);
      const uids = f.messages.map((m) => m.uid).filter((u) => u >= from);
      // Like a real server, `n:*` past the end still names the last message.
      return uids.length > 0 ? uids : f.messages.slice(-1).map((m) => m.uid);
    }
    async *fetch(range: string) {
      imap.fetched.push(`${this.open}:${range}`);
      const want = new Set(range.split(',').map(Number));
      for (const m of imap.folders[this.open]!.messages) {
        if (want.has(m.uid)) yield { uid: m.uid, source: Buffer.from(m.source) };
      }
    }
    async logout() {}
    close() {}
  },
}));

const { OAuthError, SIGN_IN_AGAIN } = await import('./oauth.js');
const { checkFailure, createSmtpImapTransport, MailHostError, parseIncoming, pinHost, planFolder, pollFolders, sendFailure } = await import('./mailbox-transport.js');

// A real SMTP server: STARTTLS with smtp-server's own self-signed cert, a
// login check and per recipient answers.
interface Received {
  from: string;
  to: string[];
  raw: string;
}
const received: Received[] = [];
let server: SMTPServer;
let smtpPort = 0;

beforeAll(async () => {
  server = new SMTPServer({
    authMethods: ['PLAIN', 'LOGIN', 'XOAUTH2'],
    logger: false,
    onAuth(auth, _session, cb) {
      if (auth.method === 'XOAUTH2') {
        if (auth.username === 'me@acme.io' && auth.accessToken === 'good-token') return cb(null, { user: auth.username });
        return cb(null, { data: { status: '401', schemes: 'bearer' } });
      }
      if (auth.username === 'me@acme.io' && auth.password === 'app-pass') cb(null, { user: auth.username });
      else cb(Object.assign(new Error('5.7.8 Username and Password not accepted'), { responseCode: 535 }));
    },
    onRcptTo(addr, _session, cb) {
      if (addr.address.startsWith('gone@')) return cb(Object.assign(new Error('5.1.1 The email account does not exist'), { responseCode: 550 }));
      if (addr.address.startsWith('later@')) return cb(Object.assign(new Error('4.2.1 Try again later'), { responseCode: 451 }));
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        cb();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  smtpPort = (server.server.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  received.length = 0;
  imap.folders = {};
  imap.list = [];
  imap.connectError = null;
  imap.fetched = [];
});

function creds(over: Partial<MailboxCredentials> = {}): MailboxCredentials {
  return {
    address: 'me@acme.io',
    displayName: 'Mia Acme',
    smtpHost: '127.0.0.1',
    smtpPort,
    smtpSecure: false,
    imapHost: '127.0.0.1',
    imapPort: 993,
    username: 'me@acme.io',
    password: 'app-pass',
    ...over,
  };
}

const NOW = new Date('2026-10-20T10:00:00Z');
const transport = (over: Partial<MailboxCredentials> = {}) =>
  createSmtpImapTransport(creds(over), { tls: { rejectUnauthorized: false }, now: () => NOW, allowPrivate: true });

const mail = (to: string) => ({
  to,
  subject: 'Re: Leads for Beta',
  text: 'Hi Ben,\n\nA short note.\n',
  messageId: '<0b7a@acme.io>',
  inReplyTo: '<first@acme.io>',
  references: ['<first@acme.io>'],
  headers: {
    'List-Unsubscribe': '<https://api.nvoke.run/u/tok>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});

describe('send over SMTP', () => {
  it('sends plain text over STARTTLS with our ids, threading and unsubscribe headers', async () => {
    const t = transport();
    const r = await t.send(mail('ben@beta.io'));
    await t.close();
    expect(r.ok).toBe(true);
    expect(received).toHaveLength(1);
    const got = received[0]!;
    expect(got.from).toBe('me@acme.io');
    expect(got.to).toEqual(['ben@beta.io']);
    expect(got.raw).toMatch(/^Message-ID: <0b7a@acme\.io>/im);
    expect(got.raw).toMatch(/^In-Reply-To: <first@acme\.io>/im);
    expect(got.raw).toMatch(/^References: <first@acme\.io>/im);
    expect(got.raw).toMatch(/^List-Unsubscribe: <https:\/\/api\.nvoke\.run\/u\/tok>/im);
    expect(got.raw).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/im);
    expect(got.raw).toMatch(/^From: Mia Acme <me@acme\.io>/im);
    expect(got.raw).toMatch(/^Content-Type: text\/plain/im);
    expect(got.raw).not.toMatch(/text\/html/i);

    // What we sent reads back the way the poller will read a reply.
    const parsed = await parseIncoming('INBOX', 1, got.raw, NOW);
    expect(parsed).toMatchObject({ messageId: '<0b7a@acme.io>', inReplyTo: '<first@acme.io>', references: ['<first@acme.io>'], from: 'me@acme.io' });
  });

  it('calls a refused login auth, a 5xx recipient permanent and a 4xx temporary', async () => {
    const bad = transport({ password: 'wrong' });
    expect(await bad.send(mail('ben@beta.io'))).toMatchObject({ ok: false, kind: 'auth' });
    await bad.close();

    const t = transport();
    expect(await t.send(mail('gone@beta.io'))).toMatchObject({ ok: false, kind: 'permanent' });
    expect(await t.send(mail('later@beta.io'))).toMatchObject({ ok: false, kind: 'temporary' });
    await t.close();
    expect(received).toHaveLength(0);
  });

  it('logs in with an access token over XOAUTH2, and an ended sign-in is auth', async () => {
    const t = transport({ password: '', accessToken: async () => 'good-token' });
    expect(await t.send(mail('ben@beta.io'))).toMatchObject({ ok: true });
    await t.close();
    expect(received).toHaveLength(1);

    const refused = transport({ password: '', accessToken: async () => 'stale-token' });
    expect(await refused.send(mail('ben@beta.io'))).toMatchObject({ ok: false, kind: 'auth' });
    await refused.close();

    const ended = transport({ password: '', accessToken: () => Promise.reject(new OAuthError()) });
    expect(await ended.send(mail('ben@beta.io'))).toMatchObject({ ok: false, kind: 'auth' });
    expect(await ended.check()).toEqual({ ok: false, step: 'smtp', kind: 'auth', message: SIGN_IN_AGAIN });
    await ended.close();
  });

  it('calls a server that is not there temporary', async () => {
    const t = transport({ smtpPort: 1 });
    expect(await t.send(mail('ben@beta.io'))).toMatchObject({ ok: false, kind: 'temporary' });
    await t.close();
  });
});

describe('check', () => {
  it('passes when both logins work', async () => {
    const t = transport();
    expect(await t.check()).toEqual({ ok: true });
    await t.close();
  });

  it('names the side and the kind of a failure', async () => {
    const bad = transport({ password: 'wrong' });
    expect(await bad.check()).toMatchObject({ ok: false, step: 'smtp', kind: 'auth' });
    await bad.close();

    imap.connectError = Object.assign(new Error('Authentication failed'), { authenticationFailed: true });
    const t = transport();
    expect(await t.check()).toMatchObject({ ok: false, step: 'imap', kind: 'auth' });
    await t.close();
  });
});

describe('host guard', () => {
  const dns = (map: Record<string, string[]>) => async (host: string) =>
    (map[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  const SMTP = [465, 587, 2525];

  it('pins a public host to its checked address and keeps the name for TLS', async () => {
    expect(await pinHost('SMTP.Acme.io', 465, SMTP, { resolve: dns({ 'smtp.acme.io': ['93.184.216.34'] }) })).toEqual({ ip: '93.184.216.34', servername: 'smtp.acme.io' });
    expect(await pinHost('93.184.216.34', 587, SMTP)).toEqual({ ip: '93.184.216.34', servername: undefined });
  });

  it('refuses loopback, private, link local and reserved addresses, and names that hide them', async () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '192.168.1.1', '240.0.0.1', '::1', '[::ffff:127.0.0.1]', 'localhost', 'db.internal']) {
      await expect(pinHost(host, 465, SMTP)).rejects.toMatchObject({ message: 'private address' });
    }
    // A mixed answer is how DNS rebinding starts.
    await expect(pinHost('rebind.acme.io', 465, SMTP, { resolve: dns({ 'rebind.acme.io': ['93.184.216.34', '127.0.0.1'] }) })).rejects.toMatchObject({ message: 'private address' });
    await expect(pinHost('nowhere.acme.io', 465, SMTP, { resolve: dns({}) })).rejects.toMatchObject({ message: 'host does not resolve' });
  });

  it('allows only the mail ports', async () => {
    for (const port of [25, 22, 5432, 6379, 80]) {
      await expect(pinHost('93.184.216.34', port, SMTP)).rejects.toBeInstanceOf(MailHostError);
    }
    await expect(pinHost('93.184.216.34', 993, [993, 143])).resolves.toMatchObject({ ip: '93.184.216.34' });
  });

  it('never connects to a refused host and answers in its own words', async () => {
    const t = createSmtpImapTransport(creds({ smtpHost: '127.0.0.1', smtpPort }), { tls: { rejectUnauthorized: false } });
    expect(await t.check()).toEqual({ ok: false, step: 'smtp', kind: 'connect', message: 'port not allowed' });
    expect(await t.send(mail('ben@beta.io'))).toEqual({ ok: false, kind: 'temporary', response: 'refused: port not allowed' });
    await t.close();
    expect(received).toHaveLength(0);

    const metadata = createSmtpImapTransport(creds({ smtpHost: '169.254.169.254', smtpPort: 587 }));
    expect(await metadata.check()).toMatchObject({ ok: false, step: 'smtp', kind: 'connect', message: 'private address' });
    await metadata.close();

    const imapSide = createSmtpImapTransport(creds({ imapHost: 'localhost' }), { tls: { rejectUnauthorized: false }, allowPrivate: true, resolve: dns({}) });
    expect(await imapSide.check()).toMatchObject({ ok: false, step: 'imap', kind: 'connect', message: 'host does not resolve' });
    await imapSide.close();
  });

  it('connects to the address the guard resolved, not a second lookup', async () => {
    const t = createSmtpImapTransport(creds({ smtpHost: 'mail.nvoke.test', imapHost: 'imap.nvoke.test' }), {
      tls: { rejectUnauthorized: false },
      allowPrivate: true,
      resolve: dns({ 'mail.nvoke.test': ['127.0.0.1'], 'imap.nvoke.test': ['127.0.0.1'] }),
    });
    expect(await t.send(mail('ben@beta.io'))).toMatchObject({ ok: true });
    await t.close();
    expect(received).toHaveLength(1);
  });
});

const raw = (o: { id: string; from?: string; inReplyTo?: string; subject?: string; date?: string; extra?: string; body?: string }) =>
  [
    `From: ${o.from ?? 'Ben Beta <Ben@Beta.io>'}`,
    'To: Mia Acme <me@acme.io>',
    `Subject: ${o.subject ?? 'Re: Leads for Beta'}`,
    `Date: ${o.date ?? 'Mon, 19 Oct 2026 09:00:00 +0000'}`,
    `Message-ID: ${o.id}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`, `References: <first@acme.io>\r\n ${o.inReplyTo}`] : []),
    ...(o.extra ? [o.extra] : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    o.body ?? 'Sounds good, call me Thursday.',
    '',
  ].join('\r\n');

const BOUNCE = [
  'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
  'To: me@acme.io',
  'Subject: Delivery Status Notification (Failure)',
  'Date: Mon, 19 Oct 2026 09:05:00 +0000',
  'Message-ID: <dsn1@mx.google.com>',
  'Auto-Submitted: auto-replied',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=delivery-status; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  "Your message wasn't delivered to gone@beta.io because the address couldn't be found.",
  '',
  '--b1',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; googlemail.com',
  '',
  'Final-Recipient: rfc822; gone@beta.io',
  'Action: failed',
  'Status: 5.1.1',
  '',
  '--b1--',
  '',
].join('\r\n');

describe('parse', () => {
  it('reads ids, threading, addresses and headers from a reply', async () => {
    const m = await parseIncoming('INBOX', 7, raw({ id: '<r1@beta.io>', inReplyTo: '<0b7a@acme.io>', extra: 'X-Autoreply: yes' }), NOW);
    expect(m).toMatchObject({
      folder: 'INBOX',
      uid: 7,
      messageId: '<r1@beta.io>',
      inReplyTo: '<0b7a@acme.io>',
      references: ['<first@acme.io>', '<0b7a@acme.io>'],
      from: 'ben@beta.io',
      to: ['me@acme.io'],
      subject: 'Re: Leads for Beta',
      deliveryStatus: null,
    });
    expect(m.text.trim()).toBe('Sounds good, call me Thursday.');
    expect(m.headers['x-autoreply']).toBe('yes');
    expect(m.headers['content-type']).toMatch(/text\/plain/);
    expect(m.date.toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });

  it('keeps the delivery-status part of a bounce raw', async () => {
    const m = await parseIncoming('INBOX', 8, BOUNCE, NOW);
    expect(m.from).toBe('mailer-daemon@googlemail.com');
    expect(m.headers['content-type']).toMatch(/multipart\/report/);
    expect(m.deliveryStatus).toMatch(/Final-Recipient: rfc822; gone@beta\.io/);
    expect(m.deliveryStatus).toMatch(/Status: 5\.1\.1/);
  });
});

describe('poll', () => {
  it('picks every folder a reply can land in, not sent, drafts, trash or all mail', () => {
    expect(pollFolders([{ path: 'INBOX', specialUse: '\\Inbox' }, { path: '[Gmail]/Spam', specialUse: '\\Junk' }, { path: 'Sent', specialUse: '\\Sent' }])).toEqual(['INBOX', '[Gmail]/Spam']);
    expect(pollFolders([{ path: 'INBOX' }, { path: 'Archive' }, { path: 'Newsletter' }])).toEqual(['INBOX', 'Archive', 'Newsletter']);
    expect(pollFolders([{ path: 'INBOX' }, { path: '[Gmail]/All Mail', specialUse: '\\All' }, { path: 'Drafts', specialUse: '\\Drafts' }, { path: 'Trash', specialUse: '\\Trash' }, { path: '[Gmail]', flags: new Set(['\\Noselect']) }])).toEqual(['INBOX']);
  });

  it('plans by date when the folder is new or its UIDVALIDITY changed, else after the last UID', () => {
    expect(planFolder(undefined, 5)).toMatchObject({ since: true, lastUid: 0 });
    expect(planFolder({ uidValidity: 4, lastUid: 90 }, 5)).toMatchObject({ since: true, lastUid: 0 });
    expect(planFolder({ uidValidity: 5, lastUid: 90 }, 5)).toEqual({ uidValidity: 5, since: false, fromUid: 91, lastUid: 90 });
  });

  it('reads both folders after the saved UIDs and moves the state on', async () => {
    imap.list = [{ path: 'INBOX' }, { path: 'Junk', specialUse: '\\Junk' }];
    imap.folders = {
      INBOX: {
        uidValidity: 11,
        messages: [
          { uid: 3, source: raw({ id: '<old@beta.io>' }), date: new Date('2026-10-01T00:00:00Z') },
          { uid: 4, source: raw({ id: '<r1@beta.io>', inReplyTo: '<0b7a@acme.io>' }), date: new Date('2026-10-19T00:00:00Z') },
        ],
      },
      Junk: { uidValidity: 2, messages: [{ uid: 9, source: BOUNCE, date: new Date('2026-10-19T00:00:00Z') }] },
    };
    const t = transport();

    // First poll: INBOX is known up to UID 3, Junk is new and starts at the last 7 days.
    const first = await t.poll({ INBOX: { uidValidity: 11, lastUid: 3 } });
    expect(first.messages.map((m) => [m.folder, m.uid, m.messageId])).toEqual([
      ['INBOX', 4, '<r1@beta.io>'],
      ['Junk', 9, '<dsn1@mx.google.com>'],
    ]);
    expect(first.state).toEqual({ INBOX: { uidValidity: 11, lastUid: 4 }, Junk: { uidValidity: 2, lastUid: 9 } });

    // Nothing new: the `n:*` quirk does not bring UID 4 back.
    const second = await t.poll(first.state);
    expect(second.messages).toEqual([]);
    expect(second.state).toEqual(first.state);

    // A reset INBOX starts over from the last 7 days, so the October 1 mail stays out.
    imap.folders.INBOX!.uidValidity = 12;
    const third = await t.poll(second.state);
    expect(third.messages.map((m) => m.messageId)).toEqual(['<r1@beta.io>']);
    expect(third.state.INBOX).toEqual({ uidValidity: 12, lastUid: 4 });
    await t.close();
  });
});

describe('error kinds', () => {
  it('maps SMTP errors to send results', () => {
    expect(sendFailure({ code: 'EAUTH', response: '535 no' })).toMatchObject({ kind: 'auth' });
    expect(sendFailure({ code: 'EENVELOPE', responseCode: 550, response: '550 no such user' })).toMatchObject({ kind: 'permanent', response: '550 no such user' });
    expect(sendFailure({ code: 'EENVELOPE', responseCode: 452, response: '452 later' })).toMatchObject({ kind: 'temporary' });
    expect(sendFailure({ code: 'ETIMEDOUT', message: 'Connection timeout' })).toMatchObject({ kind: 'temporary' });
  });

  it('maps check errors to kinds', () => {
    expect(checkFailure({ authenticationFailed: true, message: 'x' }).kind).toBe('auth');
    expect(checkFailure({ code: 'ESOCKET', message: 'unable to verify the first certificate' }).kind).toBe('tls');
    expect(checkFailure({ code: 'ECONNECTION', message: 'connect ECONNREFUSED 127.0.0.1:1' }).kind).toBe('connect');
    expect(checkFailure(new Error('weird')).kind).toBe('other');
  });
});
