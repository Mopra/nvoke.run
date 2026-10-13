// Public privacy routes (docs/SPEC.md, "Privacy"). No sign-in: the site's
// opt-out page calls them from the browser, so their origin needs CORS
// (CORS_ORIGINS, which defaults to https://nvoke.run).
//
// There is no email confirmation: an opt-out only ever removes data, so a
// request made in someone else's name cannot harm them. The answer is always
// { ok: true }, whether or not nvoke held anything, so the route cannot be
// used to test which addresses are in the data.

import type { FastifyPluginAsync } from 'fastify';
import type { Sql } from 'postgres';
import { OptOutRequest, type OptOutResponse } from '@nvoke/shared';
import { erase } from '../../privacy/erase.js';
import { fixedWindowLimiter } from '../../privacy/rate-limit.js';
import { isSharedMailDomain, parseAddress, parseDomain } from '../../privacy/target.js';

export interface PrivacyRoutesOptions {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  /**
   * Requests per client IP (request.ip) per window. Defaults to 10 an hour.
   * request.ip is the real client only when the app's trustProxy matches the
   * deployment; app.ts trusts the private network Traefik sits on.
   */
  rateLimit?: { max: number; windowMs: number };
}

export const privacyRoutes: FastifyPluginAsync<PrivacyRoutesOptions> = async (app, opts) => {
  const { max, windowMs } = opts.rateLimit ?? { max: 10, windowMs: 60 * 60 * 1000 };
  const limiter = fixedWindowLimiter(max, windowMs);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'privacy route failed');
    const status = typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : 'invalid_request' });
  });

  app.post('/opt-out', async (req, reply): Promise<OptOutResponse | void> => {
    if (!limiter.take(req.ip)) return reply.code(429).send({ error: 'rate_limited' });

    const parsed = OptOutRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });

    if ('email' in parsed.data) {
      const address = parseAddress(parsed.data.email);
      if (!address) return reply.code(400).send({ error: 'invalid_request' });
      await erase(opts.getSql(), { address }, 'opt_out_page');
    } else {
      const domain = parseDomain(parsed.data.domain);
      if (!domain) return reply.code(400).send({ error: 'invalid_request' });
      // Shared mailbox providers are never suppressed as a whole from here.
      if (isSharedMailDomain(domain)) req.log.warn({ domain }, 'opt-out for a shared mail domain ignored');
      else await erase(opts.getSql(), { domain }, 'opt_out_page');
    }
    return { ok: true };
  });
};
