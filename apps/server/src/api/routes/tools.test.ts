import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolEmailAuthResponse, ToolExtractEmailsResponse, ToolVerifyEmailResponse } from '@nvoke/shared';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { addressHash, domainHash } from '../../leads/suppression.js';
import type { CrawlResult } from '../../leads/crawl.js';
import type { VerifyResult } from '../../leads/verify/index.js';
import type { AuthDns } from '../../tools/email-auth.js';
import { toolsRoutes, type ToolsRoutesOptions } from './tools.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate suppressions, domains, email_checks cascade`;
});

const verdict = (address: string, reason: string, verification: VerifyResult['verification'] = 'valid'): VerifyResult => ({
  address,
  verification,
  reason,
  mxHost: 'mx.acme.dk',
});

const nodata = () => Object.assign(new Error('nodata'), { code: 'ENODATA' });

const authDns: AuthDns = {
  resolveMx: async (d) => {
    if (d === 'acme.dk') return [{ exchange: 'mx.acme.dk', priority: 10 }];
    throw Object.assign(new Error('notfound'), { code: 'ENOTFOUND' });
  },
  resolve4: async () => [],
  resolve6: async () => [],
  resolveTxt: async (name) => {
    if (name === 'acme.dk') return [['v=spf1 include:_spf.mail.dk -all']];
    if (name === '_spf.mail.dk') return [['v=spf1 ip4:192.0.2.0/24 a mx -all']];
    if (name === '_dmarc.acme.dk') return [['v=DMARC1; p=reject; rua=mailto:d@acme.dk']];
    if (name === 'google._domainkey.acme.dk') return [['v=DKIM1; k=rsa; p=MIIB']];
    throw nodata();
  },
};

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

const lite = { verify: async (a: string) => verdict(a, 'mx_only', 'unknown') };

async function makeApp(over: Partial<ToolsRoutesOptions> = {}): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: ['loopback', 'uniquelocal'] });
  await app.register(toolsRoutes, {
    prefix: '/v1/tools',
    getSql: () => db.sql,
    verifier: { full: { verify: async (a) => verdict(a, 'rcpt_accepted') }, lite },
    crawl: async () => ({ status: 'done', emails: [], pages: [] }),
    authDns,
    turnstile: null,
    ...over,
  });
  await app.ready();
  return app;
}

const post = (app: FastifyInstance, path: string, payload: object, ip = freshIp()) =>
  app.inject({ method: 'POST', url: `/v1/tools/${path}`, payload, headers: { 'x-forwarded-for': `10.9.9.9, ${ip}` } });

describe('POST /v1/tools/verify-email', () => {
  it('probes the mailbox while the daily probe budget lasts, then answers from DNS', async () => {
    const app = await makeApp({ limits: { probesPerDay: 1 } });
    const first = await post(app, 'verify-email', { email: 'Jane@Acme.dk' });
    expect(first.statusCode).toBe(200);
    expect(ToolVerifyEmailResponse.parse(first.json())).toEqual({
      email: 'jane@acme.dk',
      verification: 'valid',
      reason: 'rcpt_accepted',
      mxHost: 'mx.acme.dk',
      depth: 'mailbox',
    });
    const second = await post(app, 'verify-email', { email: 'bob@acme.dk' });
    expect(second.json()).toMatchObject({ verification: 'unknown', depth: 'domain' });
    await app.close();
  });

  it('marks a paced probe as a domain only answer', async () => {
    const app = await makeApp({ verifier: { full: { verify: async (a) => verdict(a, 'smtp_paced', 'unknown') }, lite } });
    expect((await post(app, 'verify-email', { email: 'jane@acme.dk' })).json()).toMatchObject({ depth: 'domain' });
    await app.close();
  });

  it('never probes an opted-out address', async () => {
    await db.sql`insert into suppressions (hash, kind, source) values (${addressHash('jane@acme.dk')}, 'address', 'opt_out_page')`;
    const full = vi.fn(async (a: string) => verdict(a, 'rcpt_accepted'));
    const app = await makeApp({ verifier: { full: { verify: full }, lite } });
    expect((await post(app, 'verify-email', { email: 'jane@acme.dk' })).json()).toMatchObject({ depth: 'domain' });
    expect(full).not.toHaveBeenCalled();
    await app.close();
  });

  it('answers a malformed address as invalid without a check', async () => {
    const app = await makeApp();
    expect((await post(app, 'verify-email', { email: 'not an email' })).json()).toMatchObject({ verification: 'invalid', reason: 'syntax' });
    await app.close();
  });

  it('limits per IP and per day', async () => {
    const app = await makeApp({ limits: { verifyPerIp: { max: 2, windowMs: 60_000 }, verifyPerDay: 3 } });
    const ip = freshIp();
    expect((await post(app, 'verify-email', { email: 'a@acme.dk' }, ip)).statusCode).toBe(200);
    expect((await post(app, 'verify-email', { email: 'b@acme.dk' }, ip)).statusCode).toBe(200);
    const limited = await post(app, 'verify-email', { email: 'c@acme.dk' }, ip);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'rate_limited' });
    expect((await post(app, 'verify-email', { email: 'd@acme.dk' })).statusCode).toBe(200);
    expect((await post(app, 'verify-email', { email: 'e@acme.dk' })).json()).toEqual({ error: 'busy' });
    await app.close();
  });

  it('requires a passing Turnstile token when configured', async () => {
    const app = await makeApp({ turnstile: async (token) => token === 'ok' });
    expect((await post(app, 'verify-email', { email: 'a@acme.dk' })).statusCode).toBe(403);
    expect((await post(app, 'verify-email', { email: 'a@acme.dk', turnstileToken: 'nope' })).json()).toEqual({ error: 'captcha_failed' });
    expect((await post(app, 'verify-email', { email: 'a@acme.dk', turnstileToken: 'ok' })).statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /v1/tools/extract-emails', () => {
  const crawled: CrawlResult = {
    status: 'done',
    pages: [],
    emails: [
      { address: 'info@acme.dk', kind: 'generic', via: 'mailto', sourceUrl: 'https://acme.dk/contact' },
      { address: 'jane@acme.dk', kind: 'personal', via: 'mailto', sourceUrl: 'https://acme.dk/team' },
      { address: 'sales@acme.dk', kind: 'generic', via: 'text', sourceUrl: 'https://acme.dk/' },
    ],
  };

  it('shows generic addresses, counts people, drops opted-out addresses and fills the shared cache', async () => {
    await db.sql`insert into suppressions (hash, kind, source) values (${addressHash('sales@acme.dk')}, 'address', 'opt_out_page')`;
    const crawl = vi.fn(async () => crawled);
    const app = await makeApp({ crawl });
    const res = await post(app, 'extract-emails', { domain: 'https://www.Acme.dk/about' });
    expect(res.statusCode).toBe(200);
    expect(ToolExtractEmailsResponse.parse(res.json())).toEqual({
      domain: 'acme.dk',
      status: 'done',
      emails: [{ address: 'info@acme.dk', sourceUrl: 'https://acme.dk/contact' }],
      hiddenPersonal: 1,
      cached: false,
    });
    expect(crawl).toHaveBeenCalledWith('https://acme.dk/', 'acme.dk', expect.any(AbortSignal));
    expect(await db.sql`select domain, has_personal from domains`).toEqual([{ domain: 'acme.dk', has_personal: true }]);
    expect(await db.sql`select address from domain_emails`).toEqual([{ address: 'info@acme.dk' }]);
    await app.close();
  });

  it('answers from the shared cache without crawling', async () => {
    await db.sql`insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at) values ('acme.dk', 'done', now(), false, now() + interval '30 days')`;
    await db.sql`insert into domain_emails (domain, address, source_url) values ('acme.dk', 'info@acme.dk', null)`;
    const crawl = vi.fn(async () => crawled);
    const app = await makeApp({ crawl });
    expect((await post(app, 'extract-emails', { domain: 'acme.dk' })).json()).toMatchObject({
      status: 'done',
      emails: [{ address: 'info@acme.dk', sourceUrl: null }],
      cached: true,
    });
    expect(crawl).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not crawl an opted-out domain', async () => {
    await db.sql`insert into suppressions (hash, kind, source) values (${domainHash('acme.dk')}, 'domain', 'opt_out_page')`;
    const crawl = vi.fn(async () => crawled);
    const app = await makeApp({ crawl });
    expect((await post(app, 'extract-emails', { domain: 'shop.acme.dk' })).json()).toMatchObject({ status: 'opted_out', emails: [] });
    expect(crawl).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses webmail and non domains', async () => {
    const app = await makeApp();
    expect((await post(app, 'extract-emails', { domain: 'gmail.com' })).statusCode).toBe(400);
    expect((await post(app, 'extract-emails', { domain: 'localhost' })).statusCode).toBe(400);
    expect((await post(app, 'extract-emails', { domain: '10.0.0.1' })).statusCode).toBe(400);
    await app.close();
  });

  it('answers failed when the crawl throws, and caps crawls a day', async () => {
    const app = await makeApp({ crawl: async () => Promise.reject(new Error('timeout')), limits: { extractPerDay: 1 } });
    expect((await post(app, 'extract-emails', { domain: 'acme.dk' })).json()).toMatchObject({ status: 'failed' });
    expect((await post(app, 'extract-emails', { domain: 'other.dk' })).json()).toEqual({ error: 'busy' });
    await app.close();
  });
});

describe('POST /v1/tools/email-auth', () => {
  it('grades MX, SPF, DMARC and DKIM', async () => {
    const app = await makeApp();
    const res = await post(app, 'email-auth', { domain: 'acme.dk' });
    expect(res.statusCode).toBe(200);
    const body = ToolEmailAuthResponse.parse(res.json());
    expect(body.mx).toEqual({ grade: 'pass', hosts: ['mx.acme.dk'], notes: [] });
    expect(body.spf).toMatchObject({ grade: 'pass', all: '-all', lookups: 3 });
    expect(body.dmarc).toMatchObject({ grade: 'pass', policy: 'reject' });
    expect(body.dkim).toMatchObject({ grade: 'pass', selectors: ['google'] });
    await app.close();
  });

  it('fails a domain with nothing set up', async () => {
    const app = await makeApp();
    const body = ToolEmailAuthResponse.parse((await post(app, 'email-auth', { domain: 'empty.dk' })).json());
    expect([body.mx.grade, body.spf.grade, body.dmarc.grade, body.dkim.grade]).toEqual(['fail', 'fail', 'fail', 'warn']);
    await app.close();
  });
});
