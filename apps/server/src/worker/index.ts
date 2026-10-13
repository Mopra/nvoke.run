/**
 * Worker entry point. Runs the lead pipeline jobs (find, crawl, verify) from
 * the Postgres queue, the feed collectors and daily drops (every minute) and
 * the hourly retention purge, in a separate process from the API. SIGTERM
 * stops claiming, gives running jobs time to finish, and hands the rest back.
 */
import { loadEnv } from '../env.js';
import { closeSql, getSql } from '../db/client.js';
import { logger } from '../logger.js';
import { collectDue } from '../feed/collect.js';
import { createCollectors } from '../feed/collectors.js';
import { runDueDrops } from '../feed/drops.js';
import { createClerkClient } from '@clerk/backend';
import { purgeAgentSignups } from '../agents/purge.js';
import { purge, RETENTION } from '../leads/retention.js';
import { VERSION } from '../version.js';
import { createPipelineDeps } from './deps.js';
import { Runner } from './runner.js';

const FEED_TICK_MS = 60_000;

const env = loadEnv();
const log = logger('worker');

if (!env.DATABASE_URL) {
  log.error('DATABASE_URL is not set; the worker has nothing to do');
  process.exit(1);
}

const sql = getSql();
let stopping = false;
const runner = new Runner(createPipelineDeps(sql, env, log), { concurrency: env.WORKER_CONCURRENCY });
runner.start();

// Retention purge: once at start, then hourly. Idempotent, so several
// workers running it at once is harmless.
const clerk = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null;
async function runPurge(): Promise<void> {
  try {
    const deleted = await purge(sql);
    const agents = await purgeAgentSignups(sql, clerk ? async (id) => void (await clerk.users.deleteUser(id)) : null);
    log.info({ deleted, agents }, 'retention purge done');
  } catch (err) {
    log.error({ err }, 'retention purge failed');
  }
}
void runPurge();
const purgeTimer = setInterval(() => void runPurge(), RETENTION.purgeIntervalMs);
purgeTimer.unref();

// The feed and drops: every minute, collect from the sources that are due,
// then turn due drops into searches. Both are safe from several workers.
const collectors = createCollectors({ productHuntToken: env.PRODUCT_HUNT_TOKEN });
let feedBusy = false;
async function runFeed(): Promise<void> {
  if (feedBusy || stopping) return;
  feedBusy = true;
  try {
    await collectDue(sql, collectors, log);
    await runDueDrops(sql, log);
  } catch (err) {
    log.error({ err }, 'feed tick failed');
  } finally {
    feedBusy = false;
  }
}
void runFeed();
const feedTimer = setInterval(() => void runFeed(), FEED_TICK_MS);
feedTimer.unref();

log.info(
  {
    version: VERSION,
    env: env.NODE_ENV,
    workerId: runner.workerId,
    concurrency: env.WORKER_CONCURRENCY,
    web: Boolean(env.BRAVE_SEARCH_API_KEY),
    productHunt: Boolean(env.PRODUCT_HUNT_TOKEN),
    smtpProbe: env.SMTP_PROBE_ENABLED,
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal, inFlight: runner.inFlight }, 'worker shutting down');
  clearInterval(purgeTimer);
  clearInterval(feedTimer);
  try {
    await runner.stop(25_000);
  } finally {
    await closeSql();
    process.exit(0);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
