// Production wiring of the free tools from the environment.

import type { Sql } from 'postgres';
import type { Env } from '../env.js';
import { crawlSite } from '../leads/crawl.js';
import type { FetchLike } from '../leads/http.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { dbVerifyCache } from '../leads/verify/db-cache.js';
import { Verifier } from '../leads/verify/index.js';
import { resolvePublic } from '../webhooks/address.js';
import type { ToolsRoutesOptions } from '../api/routes/tools.js';
import { turnstileCheck } from './turnstile.js';

/** Pages one public crawl reads, below the pipeline's 8 to stay inside the site's patience. */
const TOOL_CRAWL_MAX_PAGES = 6;

/**
 * The worker's IPv4 SMTP sessions a minute: SMTP_PROBES_PER_MINUTE less the
 * tools' share, since both processes probe from the same VPS address.
 * 0 (no limit) stays 0.
 */
export function workerProbesPerMinute(env: Pick<Env, 'SMTP_PROBES_PER_MINUTE' | 'TOOLS_SMTP_PROBES_PER_MINUTE'>): number {
  return lessToolsShare(env.SMTP_PROBES_PER_MINUTE, env);
}

/** The worker's SMTP sessions a minute in all: SMTP_SESSIONS_PER_MINUTE less the tools' share. */
export function workerSessionsPerMinute(env: Pick<Env, 'SMTP_SESSIONS_PER_MINUTE' | 'TOOLS_SMTP_PROBES_PER_MINUTE'>): number {
  return lessToolsShare(env.SMTP_SESSIONS_PER_MINUTE, env);
}

function lessToolsShare(limit: number, env: Pick<Env, 'TOOLS_SMTP_PROBES_PER_MINUTE'>): number {
  if (limit === 0) return 0;
  return Math.max(1, limit - env.TOOLS_SMTP_PROBES_PER_MINUTE);
}

/**
 * A fetch that refuses hosts resolving to private addresses, checked on
 * every request (the crawler follows redirects by hand, so every hop). A
 * typed-in domain must not reach the VPS's own network.
 */
export function publicOnlyFetch(base: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    await resolvePublic(new URL(String(input)).hostname, { allowPrivate: false });
    return base(input, init);
  };
}

export function createToolsDeps(getSql: () => Sql, env: Env): Omit<ToolsRoutesOptions, 'limits' | 'now' | 'authDns'> {
  const share = env.TOOLS_SMTP_PROBES_PER_MINUTE;
  const common = { heloName: env.SMTP_HELO_NAME, mailFrom: env.SMTP_PROBE_FROM, preferIpv6: env.SMTP_PREFER_IPV6 };
  // The cache is built per call so the API still boots without DATABASE_URL.
  const cache = {
    get: (address: string) => dbVerifyCache(getSql()).get(address),
    set: (result: Parameters<ReturnType<typeof dbVerifyCache>['set']>[0]) => dbVerifyCache(getSql()).set(result),
  };
  const full = new Verifier({
    ...common,
    smtpEnabled: env.SMTP_PROBE_ENABLED && share > 0,
    probesPerMinute: share,
    sessionsPerMinute: share,
    cache,
  });
  const lite = new Verifier({ ...common, smtpEnabled: false, cache });

  const fetchImpl = publicOnlyFetch();
  const limiter = new RateLimiter(1_000);
  const crawlDeps = { fetch: fetchImpl, limiter, robots: new RobotsCache({ fetch: fetchImpl, limiter }) };

  return {
    getSql,
    verifier: { full, lite },
    crawl: (website, domain, signal) => crawlSite(website, domain, crawlDeps, { signal, maxPages: TOOL_CRAWL_MAX_PAGES }),
    turnstile: env.TURNSTILE_SECRET_KEY ? turnstileCheck(env.TURNSTILE_SECRET_KEY) : null,
  };
}
