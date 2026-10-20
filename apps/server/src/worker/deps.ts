import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { createAiFromEnv } from '../ai/client.js';
import { createAlerter } from '../alerts.js';
import type { Env } from '../env.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { createAdapters } from '../leads/sources/index.js';
import { braveAlone } from '../leads/sources/paid-search.js';
import { dbVerifyCache } from '../leads/verify/db-cache.js';
import { Verifier } from '../leads/verify/index.js';
import { workerProbesPerMinute, workerSessionsPerMinute } from '../tools/deps.js';
import type { PipelineDeps } from './pipeline.js';

/** One request per second per host, for pages and robots.txt alike. */
export const CRAWL_INTERVAL_MS = 1_000;

/** Production wiring of the pipeline from the environment. */
export function createPipelineDeps(sql: Sql, env: Env, log: Logger): PipelineDeps {
  const limiter = new RateLimiter(CRAWL_INTERVAL_MS);
  const alert = createAlerter({ sql, log, apiKey: env.DAY3_API_KEY, to: env.ALERT_EMAIL_TO, from: env.ALERT_EMAIL_FROM });
  const ai = createAiFromEnv(sql, log);
  // One limiter and robots cache, so list pages read by plain-words searches and crawls share the per host rate.
  const crawl = { limiter, robots: new RobotsCache({ limiter }) };
  return {
    sql,
    log,
    ai,
    adapters: createAdapters(env, { sql, ai, crawl, alert }),
    alert,
    // With Serper as primary or fallback, each provider's budget is checked by paid-search.ts instead.
    braveBudget:
      env.BRAVE_MONTHLY_BUDGET_USD && braveAlone(env)
        ? { monthlyUsd: env.BRAVE_MONTHLY_BUDGET_USD, costPer1000Usd: env.BRAVE_COST_PER_1000_USD }
        : undefined,
    crawl,
    verifier: new Verifier({
      heloName: env.SMTP_HELO_NAME,
      mailFrom: env.SMTP_PROBE_FROM,
      smtpEnabled: env.SMTP_PROBE_ENABLED,
      probesPerMinute: workerProbesPerMinute(env),
      // The free tools never probe through a relay, so each relay gets the whole cap.
      relays: env.SMTP_RELAYS.map((relay) => ({ ...relay, perMinute: env.SMTP_PROBES_PER_MINUTE })),
      sessionsPerMinute: workerSessionsPerMinute(env),
      sessionsPerProviderPerMinute: env.SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE,
      preferIpv6: env.SMTP_PREFER_IPV6,
      cache: dbVerifyCache(sql),
      // A lane without port 25 shrinks the check budget and checks queue up for hours: the operator must know.
      onPort25Blocked: (lane) => {
        log.error({ lane }, 'verify: outbound port 25 looks blocked on a lane, its probing paused');
        void alert.send({
          key: 'smtp-port25-blocked',
          subject: 'nvoke: outbound port 25 is blocked on the worker',
          text: `The verifier could not reach port 25 of Gmail, iCloud or Yahoo over lane ${lane} (ipv4 is this VPS, ipv4:relayN the Nth entry of SMTP_RELAYS), so that lane is paused for 10 minutes at a time. Checks wait in the queue for the other lanes; they settle unknown only after 48 hours. Check the VPS provider (outbound SMTP limits), the relay tunnel and journalctl -u nvoke-worker.`,
          everyMs: 6 * 60 * 60_000,
        });
      },
    }),
  };
}
