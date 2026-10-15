import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyRcpt, isDisposableDomain, isParkedMx, isTempfail, isTypoDomain, mxProvider, Verifier, ttlFor, type VerifyCache, type VerifyResult } from './index.js';
import { lookupMx, type DnsLike } from './mx.js';
import { smtpProbe } from './smtp.js';

/**
 * A scripted SMTP server. `rcpt` decides the reply for each RCPT TO address;
 * everything else follows the happy path unless overridden.
 */
interface FakeSmtpOptions {
  banner?: string;
  ehlo?: string;
  mail?: string;
  rcpt?: (address: string) => string;
  /** Delay before every reply, to test timeouts and serialization. */
  delayMs?: number;
  multilineEhlo?: boolean;
}

interface FakeSmtp {
  port: number;
  sessions: string[][];
  maxConcurrent: number;
  close(): Promise<void>;
}

const servers: FakeSmtp[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function fakeSmtp(opts: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const sessions: string[][] = [];
  let active = 0;
  const state = { maxConcurrent: 0 };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    active++;
    state.maxConcurrent = Math.max(state.maxConcurrent, active);
    const log: string[] = [];
    sessions.push(log);
    const reply = (line: string) => {
      setTimeout(() => {
        if (!socket.destroyed) socket.write(`${line}\r\n`);
      }, opts.delayMs ?? 0);
    };
    // A session counts as active until QUIT (or until the socket closes without one).
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      active--;
    };
    socket.on('close', () => {
      end();
      sockets.delete(socket);
    });
    socket.on('error', () => {});
    reply(opts.banner ?? '220 mx.fake.test ESMTP ready');
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        log.push(line);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') reply(opts.ehlo ?? (opts.multilineEhlo ? '250-mx.fake.test hello\r\n250-PIPELINING\r\n250-SIZE 10240000\r\n250 8BITMIME' : '250 mx.fake.test'));
        else if (cmd === 'HELO') reply('250 mx.fake.test');
        else if (cmd === 'MAIL') reply(opts.mail ?? '250 2.1.0 Ok');
        else if (cmd === 'RCPT') {
          const address = /<([^>]*)>/.exec(line)?.[1] ?? '';
          reply(opts.rcpt ? opts.rcpt(address) : '250 2.1.5 Ok');
        } else if (cmd === 'QUIT') {
          end();
          reply('221 2.0.0 Bye');
          setTimeout(() => socket.end(), (opts.delayMs ?? 0) + 5);
        } else if (cmd === 'DATA') reply('554 not in this test');
        else reply('502 command not implemented');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  const fake: FakeSmtp = {
    port,
    sessions,
    get maxConcurrent() {
      return state.maxConcurrent;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
  servers.push(fake);
  return fake;
}

/** DNS where every listed domain has the given MX hosts, all served by 127.0.0.1. */
function fakeDns(records: Record<string, string[] | 'nxdomain' | 'null' | 'servfail' | 'a-only'>): DnsLike {
  const err = (code: string) => Object.assign(new Error(code), { code });
  return {
    async resolveMx(domain) {
      const r = records[domain];
      if (r === undefined || r === 'nxdomain') throw err('ENOTFOUND');
      if (r === 'servfail') throw err('ESERVFAIL');
      if (r === 'null') return [{ exchange: '', priority: 0 }];
      if (r === 'a-only') throw err('ENODATA');
      return r.map((exchange, i) => ({ exchange, priority: (i + 1) * 10 }));
    },
    async resolve4(domain) {
      if (records[domain] === 'a-only') return ['127.0.0.1'];
      throw err('ENODATA');
    },
    async resolve6() {
      throw err('ENODATA');
    },
  };
}

/** Routes every MX host name to the fake server's port on localhost, or refuses for hosts in `down`. */
function connectTo(port: number, down: string[] = []) {
  return (_p: number, host: string) => net.connect({ port: down.includes(host) ? 1 : port, host: '127.0.0.1' });
}

function memoryCache(): VerifyCache & { store: Map<string, VerifyResult> } {
  const store = new Map<string, VerifyResult>();
  return {
    store,
    async get(a) {
      return store.get(a) ?? null;
    },
    async set(r) {
      store.set(r.address, r);
    },
  };
}

const base = { heloName: 'nvoke.run', mailFrom: 'probe@nvoke.run', smtpEnabled: true, connectTimeoutMs: 2_000, commandTimeoutMs: 2_000 };

describe('smtpProbe', () => {
  it('speaks EHLO, MAIL FROM and RCPT TO, never DATA, and quits', async () => {
    const smtp = await fakeSmtp({ multilineEhlo: true });
    const res = await smtpProbe({
      host: 'mx.fake.test',
      port: smtp.port,
      heloName: 'nvoke.run',
      mailFrom: 'probe@nvoke.run',
      recipients: ['info@acme.dk'],
      connect: connectTo(smtp.port),
    });
    expect(res.banner.code).toBe(220);
    expect(res.recipients[0]?.reply).toEqual({ code: 250, enhanced: '2.1.5', message: '2.1.5 Ok' });
    expect(smtp.sessions[0]).toEqual(['EHLO nvoke.run', 'MAIL FROM:<probe@nvoke.run>', 'RCPT TO:<info@acme.dk>', 'QUIT']);
  });

  it('falls back to HELO when EHLO is refused', async () => {
    const smtp = await fakeSmtp({ ehlo: '502 no ESMTP here' });
    await smtpProbe({ host: 'x', port: smtp.port, heloName: 'nvoke.run', mailFrom: 'p@nvoke.run', recipients: ['a@b.dk'], connect: connectTo(smtp.port) });
    expect(smtp.sessions[0]?.slice(0, 2)).toEqual(['EHLO nvoke.run', 'HELO nvoke.run']);
  });

  it('refuses addresses that would inject commands', async () => {
    const smtp = await fakeSmtp();
    await expect(
      smtpProbe({ host: 'x', port: smtp.port, heloName: 'n', mailFrom: 'p@n.dk', recipients: ['a@b.dk>\r\nDATA'], connect: connectTo(smtp.port) }),
    ).rejects.toThrow(/unsafe/);
  });

  it('times out on a server that never answers', async () => {
    const smtp = await fakeSmtp({ delayMs: 5_000 });
    await expect(
      smtpProbe({ host: 'x', port: smtp.port, heloName: 'n', mailFrom: 'p@n.dk', recipients: ['a@b.dk'], commandTimeoutMs: 150, connect: connectTo(smtp.port) }),
    ).rejects.toMatchObject({ stage: 'banner' });
  });
});

describe('classifyRcpt', () => {
  it.each([
    [250, '2.1.5', 'Ok', 'valid'],
    [550, '5.1.1', '5.1.1 <x@acme.dk>: Recipient address rejected: User unknown', 'invalid'],
    [550, null, 'No such user here', 'invalid'],
    [550, '5.4.1', '5.4.1 Recipient address rejected: Access denied', 'invalid'],
    [553, null, 'mailbox name not allowed', 'invalid'],
    [554, '5.7.1', '5.7.1 Service unavailable; Client host [1.2.3.4] blocked using Spamhaus', 'unknown'],
    [550, '5.7.606', '5.7.606 Access denied, banned sending IP', 'unknown'],
    [450, '4.2.0', 'Greylisted, try again later', 'unknown'],
    [452, null, 'Too many recipients', 'unknown'],
    [552, '5.2.2', 'Mailbox full', 'risky'],
  ] as const)('%i %s %s is %s', (code, enhanced, message, expected) => {
    expect(classifyRcpt({ code, enhanced, message }).verification).toBe(expected);
  });
});

describe('isTypoDomain and isParkedMx', () => {
  it('knows common freemail typos and leaves the real domains alone', () => {
    expect(isTypoDomain('gamil.com')).toBe(true);
    expect(isTypoDomain('Hotmial.com')).toBe(true);
    expect(isTypoDomain('gmail.com')).toBe(false);
    expect(isTypoDomain('acme.dk')).toBe(false);
  });
  it('matches parking providers by domain suffix only', () => {
    expect(isParkedMx('mx.sedoparking.com')).toBe(true);
    expect(isParkedMx('park-mx.above.com')).toBe(true);
    expect(isParkedMx('mail.notabove.com')).toBe(false);
    expect(isParkedMx('aspmx.l.google.com')).toBe(false);
  });
});

describe('Verifier', () => {
  it('rejects bad syntax and flags disposable domains without any network', async () => {
    const v = new Verifier({ ...base, dns: fakeDns({}) });
    expect((await v.verify('not-an-address')).verification).toBe('invalid');
    expect(await v.verify('someone@mailinator.com')).toMatchObject({ verification: 'risky', reason: 'disposable' });
    expect(isDisposableDomain('inbox.mailinator.com')).toBe(true);
    expect(isDisposableDomain('acme.dk')).toBe(false);
  });

  it('marks domains without mail exchangers invalid, and DNS trouble unknown', async () => {
    const v = new Verifier({ ...base, dns: fakeDns({ 'nomx.dk': 'nxdomain', 'nullmx.dk': 'null', 'broken.dk': 'servfail' }) });
    expect(await v.verify('a@nomx.dk')).toMatchObject({ verification: 'invalid', reason: 'no_mx' });
    expect(await v.verify('a@nullmx.dk')).toMatchObject({ verification: 'invalid', reason: 'null_mx' });
    expect(await v.verify('a@broken.dk')).toMatchObject({ verification: 'unknown', reason: 'dns_error' });
  });

  it('uses the domain itself when there is no MX but an A record', async () => {
    expect(await lookupMx('aonly.dk', fakeDns({ 'aonly.dk': 'a-only' }))).toEqual({ kind: 'ok', hosts: ['aonly.dk'], implicit: true });
  });

  it('accepts a mailbox the server accepts while refusing a random one', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a === 'info@acme.dk' ? '250 2.1.5 Ok' : '550 5.1.1 User unknown') });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx1.acme.dk'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('Info@Acme.dk')).toEqual({ address: 'info@acme.dk', verification: 'valid', mxHost: 'mx1.acme.dk', reason: 'rcpt_accepted' });
    const rcpts = smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'));
    expect(rcpts).toHaveLength(3);
    expect(rcpts[1]).toMatch(/^RCPT TO:<nvoke-[0-9a-f]{12}-nx@acme\.dk>$/);
    expect(rcpts[2]).toMatch(/^RCPT TO:<nvoke-[0-9a-f]{12}-nx@acme\.dk>$/);
    expect(rcpts[2]).not.toBe(rcpts[1]);
  });

  it('marks a rejected mailbox invalid', async () => {
    const smtp = await fakeSmtp({ rcpt: () => '550 5.1.1 <gone@acme.dk>: Recipient address rejected: User unknown in virtual mailbox table' });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx1.acme.dk'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('gone@acme.dk')).toMatchObject({ verification: 'invalid', reason: 'rcpt_rejected_550' });
  });

  it('detects catch-all domains and remembers them per domain', async () => {
    const smtp = await fakeSmtp();
    const v = new Verifier({ ...base, dns: fakeDns({ 'catchall.dk': ['mx.catchall.dk'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('anyone@catchall.dk')).toMatchObject({ verification: 'catch_all', reason: 'accepts_any_recipient' });
    expect(await v.verify('someone.else@catchall.dk')).toMatchObject({ verification: 'catch_all', reason: 'domain_catch_all' });
    expect(smtp.sessions).toHaveLength(1);
  });

  it('answers unknown on greylisting and on a refused MAIL FROM', async () => {
    const grey = await fakeSmtp({ rcpt: () => '451 4.7.1 Greylisted, please try again' });
    const v1 = new Verifier({ ...base, dns: fakeDns({ 'grey.dk': ['mx.grey.dk'] }), connect: connectTo(grey.port) });
    expect(await v1.verify('a@grey.dk')).toMatchObject({ verification: 'unknown', reason: 'rcpt_tempfail_451' });

    const picky = await fakeSmtp({ mail: '550 5.7.1 Sender rejected' });
    const v2 = new Verifier({ ...base, dns: fakeDns({ 'picky.dk': ['mx.picky.dk'] }), connect: connectTo(picky.port) });
    expect(await v2.verify('a@picky.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_mail_550' });
  });

  it('tries the next MX when the first refuses connections', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const v = new Verifier({
      ...base,
      dns: fakeDns({ 'acme.dk': ['dead.acme.dk', 'alive.acme.dk'] }),
      connect: connectTo(smtp.port, ['dead.acme.dk']),
    });
    expect(await v.verify('info@acme.dk')).toMatchObject({ verification: 'valid', mxHost: 'alive.acme.dk' });
  });

  it('opens one connection per MX host at a time', async () => {
    const smtp = await fakeSmtp({ delayMs: 20, rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx.shared.test'] }), connect: connectTo(smtp.port) });
    const results = await Promise.all(['a@acme.dk', 'b@acme.dk', 'c@acme.dk', 'd@acme.dk'].map((a) => v.verify(a)));
    expect(results.every((r) => r.verification === 'valid')).toBe(true);
    expect(smtp.sessions).toHaveLength(4);
    expect(smtp.maxConcurrent).toBe(1);
  });

  it('falls back to MX only when port 25 looks blocked, and when probing is disabled', async () => {
    const hosts = ['mx1', 'mx2', 'mx3', 'mx4', 'mx5', 'mx6'];
    const dns = fakeDns(Object.fromEntries(hosts.map((h) => [`${h}.dk`, [`mail.${h}.test`]])));
    let alerts = 0;
    const v = new Verifier({ ...base, dns, connect: connectTo(1, hosts.map((h) => `mail.${h}.test`)), onPort25Blocked: () => void alerts++ });
    for (const h of hosts.slice(0, 5)) {
      expect(await v.verify(`a@${h}.dk`)).toMatchObject({ verification: 'unknown', reason: 'smtp_unreachable' });
    }
    expect(v.smtpBlocked).toBe(true);
    expect(alerts).toBe(1);
    expect(await v.verify('a@mx6.dk')).toMatchObject({ verification: 'unknown', reason: 'mx_only_port25_blocked', mxHost: 'mail.mx6.test' });

    // Nothing about the mailbox, so nothing for the cache.
    const cached: string[] = [];
    const blocked = new Verifier({
      ...base,
      dns,
      connect: connectTo(1, hosts.map((h) => `mail.${h}.test`)),
      cache: { get: async () => null, set: async (r) => void cached.push(r.reason) },
    });
    for (const h of hosts) await blocked.verify(`b@${h}.dk`);
    expect(blocked.smtpBlocked).toBe(true);
    expect(cached).not.toContain('mx_only_port25_blocked');

    const off = new Verifier({ ...base, smtpEnabled: false, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }) });
    expect(await off.verify('info@acme.dk')).toMatchObject({ verification: 'unknown', reason: 'mx_only', mxHost: 'mx.acme.dk' });
  });

  it('asks again later when a mail server would not talk to us, and never caches that', async () => {
    expect(isTempfail({ reason: 'smtp_unreachable' })).toBe(true);
    expect(isTempfail({ reason: 'smtp_rcpt_error' })).toBe(true);
    expect(isTempfail({ reason: 'mx_only_port25_blocked' })).toBe(true);
    expect(isTempfail({ reason: 'rcpt_tempfail_451' })).toBe(true);
    expect(isTempfail({ reason: 'smtp_mail_550' })).toBe(false);
    expect(isTempfail({ reason: 'rcpt_accepted' })).toBe(false);
    expect(mxProvider('alt1.aspmx.l.google.com.')).toBe('google.com');
  });

  it('does not suspect port 25 when only one provider throttles us', async () => {
    const hosts = ['aspmx', 'alt1.aspmx', 'alt2.aspmx', 'alt3.aspmx', 'alt4.aspmx'].map((h) => `${h}.l.google.test`);
    const dns = fakeDns(Object.fromEntries(hosts.map((h, i) => [`d${i}.dk`, [h]])));
    let canaryAsked = 0;
    const v = new Verifier({
      ...base,
      dns,
      connect: connectTo(1, hosts),
      port25Works: async () => {
        canaryAsked++;
        return false;
      },
    });
    for (let i = 0; i < hosts.length; i++) {
      expect(await v.verify(`a@d${i}.dk`)).toMatchObject({ verification: 'unknown', reason: 'smtp_unreachable' });
    }
    expect(canaryAsked).toBe(0);
    expect(v.smtpBlocked).toBe(false);
  });

  it('opens at most probesPerMinute SMTP connections a minute and says when to come back', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    let t = 1_000_000;
    const cached: string[] = [];
    const v = new Verifier({
      ...base,
      probesPerMinute: 2,
      now: () => t,
      dns: fakeDns({ 'a.dk': ['mx.a.test'], 'b.dk': ['mx.b.test'], 'c.dk': ['mx.c.test'] }),
      connect: connectTo(smtp.port),
      cache: { get: async () => null, set: async (r) => void cached.push(r.reason) },
    });
    expect(await v.verify('x@a.dk')).toMatchObject({ verification: 'valid' });
    t += 10_000;
    expect(await v.verify('x@b.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('x@c.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_paced', retryAfterMs: 50_000 });
    expect(cached).not.toContain('smtp_paced');
    t += 50_000;
    expect(await v.verify('x@c.dk')).toMatchObject({ verification: 'valid' });
  });

  it('keeps probing when dead MX hosts pile up but port 25 itself works', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const hosts = ['mx1', 'mx2', 'mx3', 'mx4', 'mx5'];
    const dns = fakeDns({ ...Object.fromEntries(hosts.map((h) => [`${h}.dk`, [`mx.${h}.dead`]])), 'live.dk': ['mx.live.test'] });
    let canaryAsked = 0;
    const v = new Verifier({
      ...base,
      dns,
      connect: connectTo(smtp.port, hosts.map((h) => `mx.${h}.dead`)),
      port25Works: async () => {
        canaryAsked++;
        return true;
      },
    });
    for (const h of hosts) await v.verify(`a@${h}.dk`);
    expect(canaryAsked).toBe(1);
    expect(v.smtpBlocked).toBe(false);
    expect(await v.verify('info@live.dk')).toMatchObject({ verification: 'valid', reason: 'rcpt_accepted' });
  });

  it('reads from and writes to the cache', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const cache = memoryCache();
    cache.store.set('cached@acme.dk', { address: 'cached@acme.dk', verification: 'invalid', mxHost: null, reason: 'cached' });
    const v = new Verifier({ ...base, cache, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }), connect: connectTo(smtp.port) });
    expect((await v.verify('cached@acme.dk')).verification).toBe('invalid');
    expect(smtp.sessions).toHaveLength(0);
    await v.verify('fresh@acme.dk');
    expect(cache.store.get('fresh@acme.dk')?.verification).toBe('valid');
  });

  it('keeps valid results for a week, unknown for a day and the rest for 30 days', () => {
    expect(ttlFor('unknown')).toBe(24 * 60 * 60_000);
    expect(ttlFor('valid')).toBe(7 * 24 * 60 * 60_000);
    expect(ttlFor('invalid')).toBe(30 * 24 * 60 * 60_000);
    expect(ttlFor('catch_all')).toBe(30 * 24 * 60 * 60_000);
  });

  it('does not cache a greylisted answer', async () => {
    const smtp = await fakeSmtp({ rcpt: () => '451 4.7.1 Greylisted, try again later' });
    const cache = memoryCache();
    const v = new Verifier({ ...base, cache, dns: fakeDns({ 'grey.dk': ['mx.grey.dk'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('a@grey.dk')).toMatchObject({ verification: 'unknown', reason: 'rcpt_tempfail_451' });
    expect(cache.store.size).toBe(0);
  });

  it('marks freemail typos and parked domains invalid without probing', async () => {
    const smtp = await fakeSmtp();
    const v = new Verifier({
      ...base,
      dns: fakeDns({ 'parked.dk': ['mx76.m2bp.com', 'mx.sedoparking.com'] }),
      connect: connectTo(smtp.port),
    });
    expect(await v.verify('jens@gmial.com')).toMatchObject({ verification: 'invalid', reason: 'typo_domain' });
    expect(await v.verify('info@parked.dk')).toMatchObject({ verification: 'invalid', reason: 'parked_domain' });
    expect(smtp.sessions).toHaveLength(0);
  });

  it('asks about two random addresses and calls the domain catch-all when either is accepted', async () => {
    let decoys = 0;
    const smtp = await fakeSmtp({
      rcpt: (a) => (a.startsWith('nvoke-') ? (decoys++ === 0 ? '550 5.1.1 no' : '250 ok') : '250 ok'),
    });
    const v = new Verifier({ ...base, dns: fakeDns({ 'odd.dk': ['mx.odd.dk'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('info@odd.dk')).toMatchObject({ verification: 'catch_all', reason: 'accepts_any_recipient' });
    expect(smtp.sessions[0]?.filter((l) => l.startsWith('RCPT'))).toHaveLength(3);
  });
});
