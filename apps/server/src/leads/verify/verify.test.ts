import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { mailProvider, registrableDomain } from './pacing.js';
import { classifyRcpt, isCapacityDeferral, isDisposableDomain, isParkedMx, isTempfail, isTypoDomain, mxProvider, Verifier, ttlFor, type VerifyCache, type VerifyResult } from './index.js';
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
function fakeDns(records: Record<string, string[] | 'nxdomain' | 'null' | 'servfail' | 'a-only'>, aaaa: Record<string, string> = {}): DnsLike {
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
    async resolve6(host) {
      if (aaaa[host]) return [aaaa[host]];
      throw err('ENODATA');
    },
  };
}

/** Routes every MX host name to the fake server's port on localhost, or refuses for hosts in `down`. */
function connectTo(port: number, down: string[] = []) {
  return (_p: number, host: string) => net.connect({ port: down.includes(host) ? 1 : port, host: '127.0.0.1' });
}

/** A SOCKS5 proxy that sends every CONNECT to the fake SMTP server, recording the target asked for. */
async function fakeSocks(smtpPort: number): Promise<{ port: number; targets: string[] }> {
  const targets: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    sockets.add(client);
    client.once('data', () => {
      client.write(Buffer.from([0x05, 0x00]));
      client.once('data', (req: Buffer) => {
        targets.push(`${[...req.subarray(4, 8)].join('.')}:${req.readUInt16BE(8)}`);
        const upstream = net.connect({ port: smtpPort, host: '127.0.0.1' }, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
          client.pipe(upstream).pipe(client);
        });
        sockets.add(upstream);
        upstream.on('error', () => client.destroy());
      });
    });
    client.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push({
    port: 0,
    sessions: [],
    maxConcurrent: 0,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  });
  return { port: (server.address() as net.AddressInfo).port, targets };
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
    // The two decoys go first, then the real address.
    expect(rcpts[0]).toMatch(/^RCPT TO:<nvoke-[0-9a-f]{12}-nx@acme\.dk>$/);
    expect(rcpts[1]).toMatch(/^RCPT TO:<nvoke-[0-9a-f]{12}-nx@acme\.dk>$/);
    expect(rcpts[0]).not.toBe(rcpts[1]);
    expect(rcpts[2]).toBe('RCPT TO:<info@acme.dk>');
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
    const domains = ['a.dk', 'b.dk', 'c.dk', 'd.dk'];
    const v = new Verifier({ ...base, dns: fakeDns(Object.fromEntries(domains.map((d) => [d, ['mx.shared.test']]))), connect: connectTo(smtp.port) });
    const results = await Promise.all(domains.map((d) => v.verify(`x@${d}`)));
    expect(results.every((r) => r.verification === 'valid')).toBe(true);
    expect(smtp.sessions).toHaveLength(4);
    expect(smtp.maxConcurrent).toBe(1);
  });

  it('checks addresses of one domain that arrive together in one session', async () => {
    const smtp = await fakeSmtp({ delayMs: 10, rcpt: (a) => (a.startsWith('nvoke-') || a.startsWith('gone') ? '550 5.1.1 no' : '250 ok') });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }), connect: connectTo(smtp.port) });
    const results = await Promise.all(['a@acme.dk', 'b@acme.dk', 'gone@acme.dk', 'a@acme.dk'].map((a) => v.verify(a)));
    expect(results.map((r) => r.verification)).toEqual(['valid', 'valid', 'invalid', 'valid']);
    expect(smtp.sessions).toHaveLength(1);
    // Three addresses and two decoys.
    expect(smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'))).toHaveLength(5);
  });

  it('skips the decoys while the domain refused a random address within the hour', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }), connect: connectTo(smtp.port) });
    await v.verify('a@acme.dk');
    expect(await v.verify('b@acme.dk')).toMatchObject({ verification: 'valid', reason: 'rcpt_accepted' });
    expect(smtp.sessions[1]!.filter((l) => l.startsWith('RCPT'))).toEqual(['RCPT TO:<b@acme.dk>']);
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

  it('sends IPv4 sessions through a relay once this machine has used its slots, with the relay HELO name', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const socks = await fakeSocks(smtp.port);
    const v = new Verifier({
      ...base,
      probesPerMinute: 1,
      now: () => 1_000_000,
      relays: [{ socks: { host: '127.0.0.1', port: socks.port }, heloName: 'relay.example' }],
      dns: fakeDns({ 'a.dk': ['127.0.0.11'], 'b.dk': ['127.0.0.12'], 'c.dk': ['127.0.0.13'] }),
      connect: connectTo(smtp.port),
    });
    expect(await v.verify('x@a.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('x@b.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('x@c.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_paced' });
    expect(socks.targets).toEqual(['127.0.0.12:25']);
    expect(smtp.sessions.map((s) => s[0])).toEqual(['EHLO nvoke.run', 'EHLO relay.example']);
  });

  it('leaves a relay that is down alone and says when to come back', async () => {
    const smtp = await fakeSmtp();
    const v = new Verifier({
      ...base,
      probesPerMinute: 1,
      now: () => 1_000_000,
      relays: [{ socks: { host: '127.0.0.1', port: 1 }, heloName: 'relay.example' }],
      dns: fakeDns({ 'a.dk': ['127.0.0.11'], 'b.dk': ['127.0.0.12'] }),
      connect: connectTo(smtp.port),
    });
    await v.verify('x@a.dk');
    expect(await v.verify('x@b.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_paced' });
    expect(smtp.sessions).toHaveLength(1);
  });

  it('pauses only the lane whose port 25 is blocked and goes on through the relay', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const socks = await fakeSocks(smtp.port);
    // Five MX hosts at five providers (IP literals, so the relay needs no DNS); this machine's IPv4 reaches none.
    const ips = [1, 2, 3, 4, 5, 6].map((i) => `127.0.${i}.1${i}`);
    const dns = fakeDns(Object.fromEntries(ips.map((ip, i) => [`d${i + 1}.dk`, [ip]])));
    const asked: string[] = [];
    const alerts: string[] = [];
    const v = new Verifier({
      ...base,
      dns,
      connect: connectTo(smtp.port, ips),
      relays: [{ socks: { host: '127.0.0.1', port: socks.port }, heloName: 'relay.example' }],
      port25Works: async (lane) => {
        asked.push(lane);
        return lane !== 'ipv4';
      },
      onPort25Blocked: (lane) => void alerts.push(lane),
    });
    for (let i = 1; i <= 5; i++) expect(await v.verify(`a@d${i}.dk`)).toMatchObject({ reason: 'smtp_unreachable' });
    expect(asked).toEqual(['ipv4']);
    expect(alerts).toEqual(['ipv4']);
    // Some lane still works, so probing goes on: through the relay, with its HELO name.
    expect(v.smtpBlocked).toBe(false);
    expect(await v.verify('a@d6.dk')).toMatchObject({ verification: 'valid' });
    expect(socks.targets).toEqual(['127.0.6.16:25']);
    expect(smtp.sessions.map((s) => s[0])).toEqual(['EHLO relay.example']);
  });

  it('prefers IPv6, then this machine over IPv4, then the relay', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const socks = await fakeSocks(smtp.port);
    const tried: string[] = [];
    const connect = (port: number, host: string) => {
      tried.push(host);
      return connectTo(smtp.port)(port, host);
    };
    const dns = fakeDns(
      { 'six.dk': ['aspmx.l.google.com'], 'a.dk': ['127.0.0.11'], 'b.dk': ['127.0.0.12'], 'c.dk': ['127.0.0.13'] },
      { 'aspmx.l.google.com': '2001:db8::1' },
    );
    const v = new Verifier({
      ...base,
      dns,
      connect,
      probesPerMinute: 1,
      now: () => 1_000_000,
      ipv6Available: () => true,
      relays: [{ socks: { host: '127.0.0.1', port: socks.port }, heloName: 'relay.example' }],
    });
    // IPv6 takes no IPv4 slot.
    expect(await v.verify('x@six.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('x@a.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('x@b.dk')).toMatchObject({ verification: 'valid' });
    // Every lane at its budget: queued again, not an answer.
    expect(await v.verify('x@c.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_paced' });
    expect(tried).toEqual(['2001:db8::1', '127.0.0.11']);
    expect(socks.targets).toEqual(['127.0.0.12:25']);
  });

  it('reads a refused connection at Google or Microsoft as throttling, and every IPv4 lane blocked as a wait', async () => {
    const dns = fakeDns({ 'g.dk': ['aspmx.l.google.com'], 'o.dk': ['o-dk.mail.protection.outlook.com'], 'x.dk': ['mx.x.test'] });
    const v = new Verifier({ ...base, dns, connect: connectTo(1, ['aspmx.l.google.com', 'o-dk.mail.protection.outlook.com', 'mx.x.test']) });
    expect(await v.verify('a@g.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_throttled' });
    expect(await v.verify('a@o.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_throttled' });
    expect(await v.verify('a@x.dk')).toMatchObject({ verification: 'unknown', reason: 'smtp_unreachable' });
    for (const reason of ['smtp_paced', 'mx_only_port25_blocked', 'smtp_throttled', 'aborted']) expect(isCapacityDeferral({ reason })).toBe(true);
    for (const reason of ['smtp_unreachable', 'rcpt_tempfail_451', 'no_rcpt_reply', 'mx_only']) expect(isCapacityDeferral({ reason })).toBe(false);
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
    expect(ttlFor('valid')).toBe(30 * 24 * 60 * 60_000);
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
    // Decoys go first, so the second one lands as catch-all and the real address is not asked.
    expect(smtp.sessions[0]?.filter((l) => l.startsWith('RCPT'))).toHaveLength(2);
  });
});

describe('Verifier.probeDomain', () => {
  const accepts = (list: string[]) => (a: string) => (list.includes(a) ? '250 2.1.5 Ok' : '550 5.1.1 User unknown');

  it('sends one decoy, then candidates in order, and stops at the first accepted one', async () => {
    const smtp = await fakeSmtp({ rcpt: accepts(['anna.berg@acme.dk']) });
    const cache = memoryCache();
    const v = new Verifier({ ...base, cache, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }), connect: connectTo(smtp.port) });
    const probe = await v.probeDomain('acme.dk', [
      [{ address: 'anna@acme.dk' }, { address: 'anna.berg@acme.dk' }, { address: 'annaberg@acme.dk' }],
    ]);
    expect(probe).toMatchObject({ catchAll: false, accepted: ['anna.berg@acme.dk'], reason: null, mxHost: 'mx.acme.dk' });
    const rcpts = smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'));
    expect(rcpts).toHaveLength(3);
    expect(rcpts[0]).toMatch(/^RCPT TO:<nvoke-[0-9a-f]{12}-nx@acme\.dk>$/);
    expect(rcpts.slice(1)).toEqual(['RCPT TO:<anna@acme.dk>', 'RCPT TO:<anna.berg@acme.dk>']);
    expect(cache.store.get('anna.berg@acme.dk')).toMatchObject({ verification: 'valid', reason: 'rcpt_accepted' });
    expect(cache.store.get('anna@acme.dk')).toMatchObject({ verification: 'invalid' });

    // The verify job that follows is answered from the cache.
    expect(await v.verify('anna.berg@acme.dk')).toMatchObject({ verification: 'valid' });
    expect(smtp.sessions).toHaveLength(1);
  });

  it('ends after the decoy on a catch-all domain and remembers it', async () => {
    const smtp = await fakeSmtp();
    const v = new Verifier({ ...base, dns: fakeDns({ 'any.dk': ['mx.any.dk'] }), connect: connectTo(smtp.port) });
    const probe = await v.probeDomain('any.dk', [[{ address: 'anna@any.dk' }, { address: 'anna.berg@any.dk' }]]);
    expect(probe).toMatchObject({ catchAll: true, accepted: [null], reason: 'accepts_any_recipient' });
    expect(smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'))).toHaveLength(1);
    expect(v.knownCatchAll('any.dk')).toBe(true);
    expect(await v.verify('anna@any.dk')).toMatchObject({ verification: 'catch_all', reason: 'domain_catch_all' });
    expect(smtp.sessions).toHaveLength(1);
  });

  it('tries only the pattern that worked for a colleague and keeps to the RCPT budget', async () => {
    const smtp = await fakeSmtp({ rcpt: accepts(['aberg@acme.dk', 'oholm@acme.dk']) });
    const v = new Verifier({ ...base, dns: fakeDns({ 'acme.dk': ['mx.acme.dk'] }), connect: connectTo(smtp.port) });
    const probe = await v.probeDomain('acme.dk', [
      [
        { address: 'anna@acme.dk', tag: 'first' },
        { address: 'anna.berg@acme.dk', tag: 'first.last' },
        { address: 'aberg@acme.dk', tag: 'flast' },
      ],
      [
        { address: 'ole@acme.dk', tag: 'first' },
        { address: 'oholm@acme.dk', tag: 'flast' },
      ],
      [
        { address: 'mia@acme.dk', tag: 'first' },
        { address: 'mkro@acme.dk', tag: 'flast' },
      ],
    ]);
    expect(probe.accepted).toEqual(['aberg@acme.dk', 'oholm@acme.dk', null]);
    // After the first hit, one RCPT per person: never ole@ or mia@.
    const rcpts = smtp.sessions[0]!.filter((l) => l.startsWith('RCPT')).slice(1);
    expect(rcpts).toEqual([
      'RCPT TO:<anna@acme.dk>',
      'RCPT TO:<anna.berg@acme.dk>',
      'RCPT TO:<aberg@acme.dk>',
      'RCPT TO:<oholm@acme.dk>',
      'RCPT TO:<mkro@acme.dk>',
    ]);
  });

  it('answers from the cache without a session, and says when it was paced', async () => {
    const smtp = await fakeSmtp({ rcpt: accepts(['ole@acme.dk']) });
    const cache = memoryCache();
    cache.store.set('anna@acme.dk', { address: 'anna@acme.dk', verification: 'valid', mxHost: 'mx.acme.dk', reason: 'rcpt_accepted' });
    let t = 1_000_000;
    const v = new Verifier({
      ...base,
      cache,
      now: () => t,
      probesPerMinute: 1,
      dns: fakeDns({ 'acme.dk': ['mx.acme.dk'], 'b.dk': ['mx.b.dk'] }),
      connect: connectTo(smtp.port),
    });
    expect(await v.probeDomain('acme.dk', [[{ address: 'anna@acme.dk' }]])).toMatchObject({ accepted: ['anna@acme.dk'], reason: null });
    expect(smtp.sessions).toHaveLength(0);
    await v.probeDomain('acme.dk', [[{ address: 'nobody@acme.dk' }]]);
    expect(await v.probeDomain('b.dk', [[{ address: 'ole@b.dk' }]])).toMatchObject({ accepted: [null], reason: 'smtp_paced', retryAfterMs: 60_000 });
    t += 60_000;
    expect(await v.probeDomain('acme.dk', [[{ address: 'ole@acme.dk' }]])).toMatchObject({ accepted: ['ole@acme.dk'] });
  });

  it('stops on greylisting and caches nothing it learned from it', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '451 4.7.1 try later') });
    const cache = memoryCache();
    const v = new Verifier({ ...base, cache, dns: fakeDns({ 'grey.dk': ['mx.grey.dk'] }), connect: connectTo(smtp.port) });
    const probe = await v.probeDomain('grey.dk', [[{ address: 'anna@grey.dk' }, { address: 'anna.berg@grey.dk' }]]);
    expect(probe).toMatchObject({ accepted: [null], reason: 'rcpt_tempfail_451' });
    expect(smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'))).toHaveLength(2);
    expect(cache.store.size).toBe(0);
  });

  it('gives the gate reason for domains without mail', async () => {
    const v = new Verifier({ ...base, dns: fakeDns({ 'nomx.dk': 'nxdomain' }) });
    expect(await v.probeDomain('nomx.dk', [[{ address: 'a@nomx.dk' }]])).toMatchObject({ reason: 'no_mx', accepted: [null] });
  });
});

describe('IPv6 and pacing per provider', () => {
  it('connects over IPv6 when the MX host has an AAAA record and falls back to IPv4', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const tried: string[] = [];
    const connect = (port: number, host: string) => {
      tried.push(host);
      return connectTo(smtp.port, ['2001:db8::dead'])(port, host);
    };
    const dns = fakeDns(
      { 'six.dk': ['mx.six.dk'], 'dead6.dk': ['mx.dead6.dk'] },
      { 'mx.six.dk': '2001:db8::1', 'mx.dead6.dk': '2001:db8::dead' },
    );
    const v = new Verifier({ ...base, dns, connect, probesPerMinute: 1, ipv6Available: () => true });
    expect(await v.verify('a@six.dk')).toMatchObject({ verification: 'valid' });
    expect(tried).toEqual(['2001:db8::1']);
    // IPv6 sessions leave the IPv4 cap alone.
    expect(await v.verify('b@six.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('a@dead6.dk')).toMatchObject({ verification: 'valid' });
    expect(tried.slice(2)).toEqual(['2001:db8::dead', 'mx.dead6.dk']);

    const off = new Verifier({ ...base, dns, connect, preferIpv6: false });
    tried.length = 0;
    await off.verify('c@six.dk');
    expect(tried).toEqual(['mx.six.dk']);
  });

  it('never tries IPv6 on a machine with no global IPv6 address', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const tried: string[] = [];
    const connect = (port: number, host: string) => {
      tried.push(host);
      return connectTo(smtp.port)(port, host);
    };
    const dns = fakeDns({ 'six.dk': ['mx.six.dk'] }, { 'mx.six.dk': '2001:db8::1' });
    const v = new Verifier({ ...base, dns, connect, ipv6Available: () => false });
    expect(await v.verify('a@six.dk')).toMatchObject({ verification: 'valid' });
    expect(tried).toEqual(['mx.six.dk']);
  });

  it('does not blame port 25 for IPv6 connect failures when IPv4 works', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    // Every host has an AAAA, and every IPv6 address refuses connections; the host names (IPv4) answer.
    const hosts = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'];
    const dns = fakeDns(
      Object.fromEntries(hosts.map((h) => [`${h}.dk`, [`mx.${h}.test`]])),
      Object.fromEntries(hosts.map((h, i) => [`mx.${h}.test`, `2001:db8::${i + 1}`])),
    );
    const v6down = hosts.map((_, i) => `2001:db8::${i + 1}`);
    let canaryAsked = 0;
    const v = new Verifier({
      ...base,
      dns,
      connect: connectTo(smtp.port, v6down),
      ipv6Available: () => true,
      port25Works: async () => {
        canaryAsked++;
        return false;
      },
    });
    for (const h of hosts) {
      expect(await v.verify(`a@${h}.dk`)).toMatchObject({ verification: 'valid' });
    }
    expect(canaryAsked).toBe(0);
    expect(v.smtpBlocked).toBe(false);
  });

  it('retries over IPv4 when the server blocks the IPv6 source on policy', async () => {
    const smtp = await fakeSmtp({
      // The IPv6 side is blocked by policy, IPv4 answers normally.
      rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok'),
      mail: '250 2.1.0 Ok',
    });
    // A server reached over IPv6 refuses with a policy 5xx; over IPv4 it accepts.
    const tried: string[] = [];
    const policy = await fakeSmtp({ rcpt: () => '550 5.7.1 Service unavailable; client host blocked using Spamhaus' });
    const connect = (port: number, host: string) => {
      tried.push(host);
      return net.connect({ port: host.includes(':') ? policy.port : smtp.port, host: '127.0.0.1' });
    };
    const dns = fakeDns({ 'blk.dk': ['mx.blk.test'] }, { 'mx.blk.test': '2001:db8::9' });
    const cache = memoryCache();
    const v = new Verifier({ ...base, cache, dns, connect, ipv6Available: () => true });
    expect(await v.verify('info@blk.dk')).toMatchObject({ verification: 'valid', reason: 'rcpt_accepted' });
    expect(tried).toEqual(['2001:db8::9', 'mx.blk.test']);
    // The IPv6 policy answer was never cached as unknown.
    expect(cache.store.get('info@blk.dk')?.verification).toBe('valid');
  });

  it('does not call a real address valid when the decoys were tarpitted', async () => {
    // 452 (too many recipients / tarpit) on the decoys, 250 on the real one: must not read as valid.
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '452 4.5.3 Too many recipients' : '250 ok') });
    const cache = memoryCache();
    const v = new Verifier({ ...base, cache, dns: fakeDns({ 'tar.dk': ['mx.tar.test'] }), connect: connectTo(smtp.port) });
    expect(await v.verify('real@tar.dk')).toMatchObject({ verification: 'unknown', reason: 'rcpt_tempfail_decoy' });
    // Tempfail, so nothing is cached and the pipeline retries.
    expect(cache.store.size).toBe(0);
    // The decoys went first.
    const rcpts = smtp.sessions[0]!.filter((l) => l.startsWith('RCPT'));
    expect(rcpts[0]).toMatch(/^RCPT TO:<nvoke-/);
    expect(rcpts[rcpts.length - 1]).toBe('RCPT TO:<real@tar.dk>');
  });

  it('paces sessions per mail provider under a global ceiling', async () => {
    const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('nvoke-') ? '550 5.1.1 no' : '250 ok') });
    const dns = fakeDns({
      'g1.dk': ['aspmx.l.google.com'],
      'g2.dk': ['alt1.aspmx.l.google.com'],
      'o1.dk': ['o1-dk.mail.protection.outlook.com'],
      'x1.dk': ['mx.x1.dk'],
    });
    const v = new Verifier({ ...base, dns, connect: connectTo(smtp.port), now: () => 1_000_000, sessionsPerProviderPerMinute: 1, sessionsPerMinute: 2 });
    expect(await v.verify('a@g1.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('a@g2.dk')).toMatchObject({ reason: 'smtp_paced' });
    expect(await v.verify('a@o1.dk')).toMatchObject({ verification: 'valid' });
    expect(await v.verify('a@x1.dk')).toMatchObject({ reason: 'smtp_paced' });
  });

  it('gives a provider a rest after it hangs up with 421', async () => {
    const smtp = await fakeSmtp({ rcpt: () => '421 4.7.0 Try again later, closing connection' });
    let t = 1_000_000;
    const v = new Verifier({ ...base, dns: fakeDns({ 'a.dk': ['mx.slow.test'], 'b.dk': ['mx2.slow.test'] }), connect: connectTo(smtp.port), now: () => t });
    // The decoy goes first and gets the 421, so the real address is never asked.
    expect(await v.verify('x@a.dk')).toMatchObject({ reason: 'no_rcpt_reply' });
    expect(await v.verify('x@b.dk')).toMatchObject({ reason: 'smtp_paced', retryAfterMs: 5 * 60_000 });
    t += 5 * 60_000;
    expect(await v.verify('x@b.dk')).toMatchObject({ reason: 'no_rcpt_reply' });
  });

  it('groups MX hosts by provider', () => {
    expect(mailProvider('alt2.aspmx.l.google.com.')).toBe('google');
    expect(mailProvider('acme-dk.mail.protection.outlook.com')).toBe('outlook');
    expect(mailProvider('mx1.one.com')).toBe('one.com');
    expect(registrableDomain('mx.mail.example.co.uk')).toBe('example.co.uk');
  });

  it('reads Microsoft 365 recipient refusals as unknown users', () => {
    expect(classifyRcpt({ code: 550, enhanced: '5.4.1', message: '5.4.1 Recipient address rejected: Access denied. AS(201806281)' })).toEqual({
      verification: 'invalid',
      reason: 'rcpt_rejected_550',
    });
  });
});
