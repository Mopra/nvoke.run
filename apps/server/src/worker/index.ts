/**
 * Worker entry point. Runs the lead pipeline jobs (find, crawl, verify) from
 * the Postgres queue, in a separate process from the API. SIGTERM stops
 * claiming, gives running jobs time to finish, and hands the rest back.
 */
import { loadEnv } from '../env.js';
import { closeSql, getSql } from '../db/client.js';
import { logger } from '../logger.js';
import { VERSION } from '../version.js';
import { createPipelineDeps } from './deps.js';
import { Runner } from './runner.js';

const env = loadEnv();
const log = logger('worker');

if (!env.DATABASE_URL) {
  log.error('DATABASE_URL is not set; the worker has nothing to do');
  process.exit(1);
}

const sql = getSql();
const runner = new Runner(createPipelineDeps(sql, env, log), { concurrency: env.WORKER_CONCURRENCY });
runner.start();

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

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal, inFlight: runner.inFlight }, 'worker shutting down');
  try {
    await runner.stop(25_000);
  } finally {
    await closeSql();
    process.exit(0);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
