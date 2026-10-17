// Start from your website (docs/SPEC.md, "Site profile"): build, read and
// edit the account's site profile. Building fetches a URL the user typed, so
// every hop must resolve to public addresses only (the webhook URL guard).

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import { BuildSiteProfileRequest, UpdateSiteProfileRequest } from '@nvoke/shared';
import type { Ai } from '../../ai/client.js';
import { RateLimiter } from '../../leads/limits.js';
import { RobotsCache } from '../../leads/robots.js';
import { guardedFetch } from '../../profile/guarded-fetch.js';
import { readSite } from '../../profile/read-site.js';
import { buildSiteProfile, getSiteProfile, updateSiteProfile, type BuildDeps } from '../../profile/site-profile.js';
import { requireUser } from '../user.js';
import { resolvePublic, type Resolve, type UrlPolicy } from '../../webhooks/address.js';

const BUILD_TIMEOUT_MS = 60_000;

export interface SiteProfileRoutesOptions {
  getSql: () => Sql;
  /** Upstream auth that sets request.userId (app.requireAuth). */
  authenticate: preHandlerAsyncHookHandler;
  /** Claude for the account; built lazily, so the API boots without a database. */
  getAi: () => Ai;
  urlPolicy: UrlPolicy;
  /** Tests replace the site reader and DNS. */
  read?: BuildDeps['read'];
  resolve?: Resolve;
}

export async function siteProfileRoutes(app: FastifyInstance, opts: SiteProfileRoutesOptions): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'site profile route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });
  app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);

  const checkHost = async (host: string) => {
    await resolvePublic(host, opts.urlPolicy, opts.resolve);
  };
  // Pages and robots.txt alike, every hop pinned to checked public addresses.
  const fetch = guardedFetch(opts.urlPolicy, opts.resolve);
  // One request per second per host, like the worker's crawl.
  const limiter = new RateLimiter(1_000);
  const crawl = { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
  const read = opts.read ?? ((website: string, signal?: AbortSignal) => readSite(website, crawl, signal));

  app.get('/', async (req, reply) => {
    const profile = await getSiteProfile(opts.getSql(), req.userId!);
    if (!profile) return reply.code(404).send({ error: 'not_found' });
    return profile;
  });

  app.post('/', async (req, reply) => {
    const body = BuildSiteProfileRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const sql = opts.getSql();
    // Stop reading when the caller hangs up, and never read for longer than a minute.
    const hangUp = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) hangUp.abort();
    });
    const signal = AbortSignal.any([hangUp.signal, AbortSignal.timeout(BUILD_TIMEOUT_MS)]);
    const result = await buildSiteProfile({ sql, ai: opts.getAi(), log: req.log, read, checkHost }, req.userId!, body.data.website, signal);
    if (result.ok) return result.profile;
    switch (result.error) {
      case 'invalid_request':
        return reply.code(400).send({ error: 'invalid_request', details: [{ path: ['website'], message: 'Not a website' }] });
      case 'rate_limited':
        return reply.code(429).send({ error: 'rate_limited' });
      case 'ai_unavailable':
        return reply.code(503).send({ error: 'ai_unavailable' });
      case 'site_unreadable':
        return reply.code(422).send({ error: 'site_unreadable', detail: result.detail });
    }
  });

  app.patch('/', async (req, reply) => {
    const body = UpdateSiteProfileRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const profile = await updateSiteProfile(opts.getSql(), req.userId!, body.data);
    if (!profile) return reply.code(404).send({ error: 'not_found' });
    return profile;
  });
}
