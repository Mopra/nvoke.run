import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { createAlerter } from '../alerts.js';
import type { Env } from '../env.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { createAdapters } from '../leads/sources/index.js';
import { dbVerifyCache } from '../leads/verify/db-cache.js';
import { Verifier } from '../leads/verify/index.js';
import type { PipelineDeps } from './pipeline.js';

/** One request per second per host, for pages and robots.txt alike. */
export const CRAWL_INTERVAL_MS = 1_000;

/** Production wiring of the pipeline from the environment. */
export function createPipelineDeps(sql: Sql, env: Env, log: Logger): PipelineDeps {
  const limiter = new RateLimiter(CRAWL_INTERVAL_MS);
  return {
    sql,
    log,
    adapters: createAdapters(env, { sql }),
    alert: createAlerter({ sql, log, apiKey: env.DAY3_API_KEY, to: env.ALERT_EMAIL_TO, from: env.ALERT_EMAIL_FROM }),
    braveBudget: env.BRAVE_MONTHLY_BUDGET_USD
      ? { monthlyUsd: env.BRAVE_MONTHLY_BUDGET_USD, costPer1000Usd: env.BRAVE_COST_PER_1000_USD }
      : undefined,
    crawl: { limiter, robots: new RobotsCache({ limiter }) },
    verifier: new Verifier({
      heloName: env.SMTP_HELO_NAME,
      mailFrom: env.SMTP_PROBE_FROM,
      smtpEnabled: env.SMTP_PROBE_ENABLED,
      cache: dbVerifyCache(sql),
    }),
  };
}
