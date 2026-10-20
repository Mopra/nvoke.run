// Public free tools (docs/SPEC.md, "Free tools"), shown on nvoke.run/tools.
// No sign-in, so every route is limited per client IP, and the two that
// touch other people's servers have a daily cap and optional Turnstile.
//
// The verifier shares port 25 with the worker. Hostinger cuts the VPS off
// past about 5 SMTP connections a minute, so the tools get their own small
// share (TOOLS_SMTP_PROBES_PER_MINUTE, taken off the worker's budget) and a
// daily probe cap. Past either, the answer comes from syntax and DNS only
// (`depth: domain`). Results go through the shared 7 day email_checks cache.
//
// The extractor reads one domain with the pipeline's crawler (robots.txt on
// every hop, opt-outs honored), answers from the shared crawl cache when it
// can, and shows anonymous users only generic role addresses.

import type { FastifyPluginAsync } from 'fastify';
import type { Sql } from 'postgres';
import {
  ToolEmailAuthRequest,
  ToolExtractEmailsRequest,
  ToolVerifyEmailRequest,
  type ToolEmailAuthResponse,
  type ToolExtractEmailsResponse,
  type ToolVerifyEmailResponse,
} from '@nvoke/shared';
import { checkEmailAuth, type AuthDns } from '../../tools/email-auth.js';
import type { TurnstileCheck } from '../../tools/turnstile.js';
import { fixedWindowLimiter } from '../../privacy/rate-limit.js';
import { cachedCrawl, isCacheable, recordCrawl } from '../../leads/domain-cache.js';
import { isWebmailDomain, normalizeDomain } from '../../leads/domain.js';
import { normalizeEmail } from '../../leads/extract.js';
import { isAddressSuppressed, isDomainSuppressed, suppressedAddresses } from '../../leads/suppression.js';
import type { CrawlResult } from '../../leads/crawl.js';
import type { VerifyResult } from '../../leads/verify/index.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export interface ToolLimits {
  verifyPerIp: { max: number; windowMs: number };
  extractPerIp: { max: number; windowMs: number };
  authPerIp: { max: number; windowMs: number };
  /** Verifier requests a day, all clients together. */
  verifyPerDay: number;
  /** Of those, how many may open an SMTP connection. The rest are checked by DNS. */
  probesPerDay: number;
  /** Fresh crawls a day; cache hits do not count. */
  extractPerDay: number;
  /** Crawls running at once. */
  extractConcurrent: number;
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  verifyPerIp: { max: 10, windowMs: HOUR },
  extractPerIp: { max: 5, windowMs: HOUR },
  authPerIp: { max: 30, windowMs: HOUR },
  verifyPerDay: 1_000,
  probesPerDay: 300,
  extractPerDay: 300,
  extractConcurrent: 3,
};

/** Hard stop for one public crawl, inside the site's patience. */
export const EXTRACT_TIMEOUT_MS = 25_000;

export interface ToolsRoutesOptions {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  /** `full` may probe SMTP (within its own per minute share); `lite` stops at DNS. */
  verifier: { full: { verify(address: string): Promise<VerifyResult> }; lite: { verify(address: string): Promise<VerifyResult> } };
  /** Crawls one site for the extractor; production guards it to public addresses. */
  crawl: (website: string, domain: string, signal: AbortSignal) => Promise<CrawlResult>;
  authDns?: AuthDns;
  /** Null switches Turnstile off. */
  turnstile: TurnstileCheck | null;
  limits?: Partial<ToolLimits>;
  now?: () => Date;
}

/** Reasons that mean the mailbox was not asked: no probe budget, probing off or port 25 blocked. */
const DOMAIN_ONLY = new Set(['mx_only', 'mx_only_port25_blocked', 'smtp_paced', 'smtp_throttled']);

export const toolsRoutes: FastifyPluginAsync<ToolsRoutesOptions> = async (app, opts) => {
  const limits = { ...DEFAULT_TOOL_LIMITS, ...opts.limits };
  const now = opts.now ?? (() => new Date());
  const perIp = {
    verify: fixedWindowLimiter(limits.verifyPerIp.max, limits.verifyPerIp.windowMs),
    extract: fixedWindowLimiter(limits.extractPerIp.max, limits.extractPerIp.windowMs),
    auth: fixedWindowLimiter(limits.authPerIp.max, limits.authPerIp.windowMs),
  };
  const daily = {
    verify: fixedWindowLimiter(limits.verifyPerDay, DAY),
    probes: fixedWindowLimiter(limits.probesPerDay, DAY),
    extract: fixedWindowLimiter(limits.extractPerDay, DAY),
  };
  let crawling = 0;

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'tools route failed');
    const status = typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : 'invalid_request' });
  });

  const human = async (token: string | undefined, ip: string) => !opts.turnstile || (await opts.turnstile(token, ip));

  app.post('/verify-email', async (req, reply): Promise<ToolVerifyEmailResponse | void> => {
    if (!perIp.verify.take(req.ip)) return reply.code(429).send({ error: 'rate_limited' });
    const parsed = ToolVerifyEmailRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });
    if (!(await human(parsed.data.turnstileToken, req.ip))) return reply.code(403).send({ error: 'captcha_failed' });

    const address = normalizeEmail(parsed.data.email);
    if (!address) {
      return { email: parsed.data.email.toLowerCase(), verification: 'invalid', reason: 'syntax', mxHost: null, depth: 'mailbox' };
    }
    if (!daily.verify.take('all')) return reply.code(429).send({ error: 'busy' });

    // An opted-out address is never probed: DNS says enough.
    const mayProbe = !(await isAddressSuppressed(opts.getSql(), address)) && daily.probes.take('all');
    const result = await (mayProbe ? opts.verifier.full : opts.verifier.lite).verify(address);
    return {
      email: result.address,
      verification: result.verification,
      reason: result.reason,
      mxHost: result.mxHost,
      depth: DOMAIN_ONLY.has(result.reason) ? 'domain' : 'mailbox',
    };
  });

  app.post('/extract-emails', async (req, reply): Promise<ToolExtractEmailsResponse | void> => {
    if (!perIp.extract.take(req.ip)) return reply.code(429).send({ error: 'rate_limited' });
    const parsed = ToolExtractEmailsRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });
    const domain = normalizeDomain(parsed.data.domain.toLowerCase());
    // A webmail provider's site lists nobody's business address.
    if (!domain || isWebmailDomain(domain)) return reply.code(400).send({ error: 'invalid_request' });
    if (!(await human(parsed.data.turnstileToken, req.ip))) return reply.code(403).send({ error: 'captcha_failed' });

    const sql = opts.getSql();
    const empty = { domain, emails: [], hiddenPersonal: 0, cached: false };
    if (await isDomainSuppressed(sql, domain)) return { ...empty, status: 'opted_out' };

    const hit = await cachedCrawl(sql, domain, now());
    if (hit) {
      const blocked = await suppressedAddresses(sql, hit.emails.map((e) => e.address));
      return { ...empty, status: hit.crawlStatus, emails: hit.emails.filter((e) => !blocked.has(e.address)), cached: true };
    }

    if (crawling >= limits.extractConcurrent || !daily.extract.take('all')) return reply.code(429).send({ error: 'busy' });
    crawling++;
    let result: CrawlResult;
    try {
      result = await opts.crawl(`https://${domain}/`, domain, AbortSignal.timeout(EXTRACT_TIMEOUT_MS));
    } catch (err) {
      req.log.info({ err, domain }, 'tools: crawl failed');
      return { ...empty, status: 'failed' };
    } finally {
      crawling--;
    }

    const blocked = await suppressedAddresses(sql, result.emails.map((e) => e.address));
    const found = result.emails.filter((e) => !blocked.has(e.address));
    const generic = found.filter((e) => isCacheable(e, domain)).map((e) => ({ address: e.address, sourceUrl: e.sourceUrl }));
    const hiddenPersonal = found.length - generic.length;
    // Same cache the pipeline fills, so the next search of this domain is free.
    await sql
      .begin((tx) => recordCrawl(tx, domain, { status: result.status, hasPersonal: hiddenPersonal > 0, generic, texts: result.texts }, now()))
      .catch((err: unknown) => req.log.warn({ err, domain }, 'tools: crawl cache write failed'));
    return { ...empty, status: result.status, emails: generic, hiddenPersonal };
  });

  app.post('/email-auth', async (req, reply): Promise<ToolEmailAuthResponse | void> => {
    if (!perIp.auth.take(req.ip)) return reply.code(429).send({ error: 'rate_limited' });
    const parsed = ToolEmailAuthRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });
    const domain = normalizeDomain(parsed.data.domain.toLowerCase());
    if (!domain) return reply.code(400).send({ error: 'invalid_request' });
    return checkEmailAuth(domain, opts.authDns);
  });
};
