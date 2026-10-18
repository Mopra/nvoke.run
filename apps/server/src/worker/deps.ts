import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { createAiFromEnv } from '../ai/client.js';
import { createAlerter } from '../alerts.js';
import type { Env } from '../env.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { createAdapters } from '../leads/sources/index.js';
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
    braveBudget: env.BRAVE_MONTHLY_BUDGET_USD
      ? { monthlyUsd: env.BRAVE_MONTHLY_BUDGET_USD, costPer1000Usd: env.BRAVE_COST_PER_1000_USD }
      : undefined,
    crawl,
    verifier: new Verifier({
      heloName: env.SMTP_HELO_NAME,
      mailFrom: env.SMTP_PROBE_FROM,
      smtpEnabled: env.SMTP_PROBE_ENABLED,
      probesPerMinute: workerProbesPerMinute(env),
      sessionsPerMinute: workerSessionsPerMinute(env),
      sessionsPerProviderPerMinute: env.SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE,
      preferIpv6: env.SMTP_PREFER_IPV6,
      cache: dbVerifyCache(sql),
      // Without port 25 every check ends unknown and nobody is charged: the operator must know.
      onPort25Blocked: () => {
        log.error('verify: outbound port 25 looks blocked, SMTP probing paused');
        void alert.send({
          key: 'smtp-port25-blocked',
          subject: 'nvoke: outbound port 25 is blocked on the worker',
          text: 'The verifier could not reach port 25 of Gmail, iCloud or Yahoo from the VPS, so mailbox checks end as unknown and no verified emails are delivered. Check the VPS provider (outbound SMTP limits) and journalctl -u nvoke-worker.',
          everyMs: 6 * 60 * 60_000,
        });
      },
    }),
  };
}
