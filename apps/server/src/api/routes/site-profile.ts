// Start from your website (docs/SPEC.md, "Site profile"): build, read, edit
// and delete the account's site profile. Building fetches a URL the user typed, so
// every hop must resolve to public addresses only (the webhook URL guard).
// The homepage screenshot is served without auth from /site-shots/<token>.jpg.

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import { BuildSiteProfileRequest, UpdateSiteProfileRequest } from '@nvoke/shared';
import type { Ai } from '../../ai/client.js';
import type { FetchLike } from '../../leads/http.js';
import { RateLimiter } from '../../leads/limits.js';
import { RobotsCache } from '../../leads/robots.js';
import { guardedFetch } from '../../profile/guarded-fetch.js';
import { readSite } from '../../profile/read-site.js';
import { siteShooter, type ShootSite } from '../../profile/site-shot.js';
import { buildSiteProfile, deleteSiteProfile, getSiteProfile, getSiteShot, updateSiteProfile, type BuildDeps } from '../../profile/site-profile.js';
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
  /** The API's public URL, for screenshot links. */
  apiUrl: string;
  /** Take homepage screenshots (SITE_SHOTS); needs Chromium on the machine. */
  shots: boolean;
  /** Tests replace the site reader, DNS, the image checks and the screenshot. */
  read?: BuildDeps['read'];
  resolve?: Resolve;
  imageFetch?: FetchLike;
  shoot?: ShootSite;
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
  const imageFetch = opts.imageFetch ?? fetch;
  const shoot = opts.shoot ?? (opts.shots ? siteShooter(fetch, app.log) : undefined);
  const visuals: BuildDeps['visuals'] = {
    fetch: imageFetch,
    shoot,
    shotUrl: (token) => `${opts.apiUrl.replace(/\/$/, '')}/site-shots/${token}.jpg`,
  };

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
    const result = await buildSiteProfile({ sql, ai: opts.getAi(), log: req.log, read, checkHost, visuals }, req.userId!, body.data.website, signal);
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

  app.delete('/', async (req, reply) => {
    if (!(await deleteSiteProfile(opts.getSql(), req.userId!))) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}

/** Public: a stored homepage screenshot. The 32 byte random token is the only key. */
export async function siteShotRoutes(app: FastifyInstance, opts: { getSql: () => Sql }): Promise<void> {
  app.get<{ Params: { file: string } }>('/site-shots/:file', async (req, reply) => {
    const token = /^([A-Za-z0-9_-]{43})\.jpg$/.exec(req.params.file)?.[1];
    if (!token) return reply.code(404).send({ error: 'not_found' });
    const image = await getSiteShot(opts.getSql(), token);
    if (!image) return reply.code(404).send({ error: 'not_found' });
    // A new build makes a new token, so the bytes behind one never change.
    return reply
      .header('content-type', 'image/jpeg')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(image);
  });
}
