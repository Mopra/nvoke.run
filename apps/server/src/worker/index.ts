/**
 * Worker entry point. Lead collection jobs will run here, in a separate
 * process from the API. For now it only proves the process lifecycle:
 * start, idle tick, graceful shutdown.
 */
import { loadEnv } from '../env.js';
import { closeSql } from '../db/client.js';
import { logger } from '../logger.js';
import { VERSION } from '../version.js';

const TICK_MS = 60_000;

const env = loadEnv();
const log = logger('worker');

log.info({ version: VERSION, env: env.NODE_ENV, database: Boolean(env.DATABASE_URL) }, 'worker started');

const timer = setInterval(() => {
  log.debug('tick: no jobs registered');
}, TICK_MS);

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'worker shutting down');
  clearInterval(timer);
  await closeSql();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
