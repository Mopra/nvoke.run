/**
 * Worker entry point. Runs the lead pipeline jobs (find, crawl, verify) from
 * the Postgres queue, the feed collectors and daily drops (every minute) and
 * the hourly retention purge, pushes short and ongoing plain words searches on
 * (leads/ongoing.ts), sends webhooks, and runs sending (enroll, send and read
 * replies, docs/sending/plan.md), in a separate process from the API. SIGTERM
 * stops claiming, gives running jobs time to finish, and hands the rest back.
 * It waits for running sending ticks, which stop before their next claim.
 */
import { loadEnv } from '../env.js';
import { closeSql, getSql } from '../db/client.js';
import { logger } from '../logger.js';
import { collectDue } from '../feed/collect.js';
import { createCollectors } from '../feed/collectors.js';
import { runDueDrops } from '../feed/drops.js';
import { createClerkClient } from '@clerk/backend';
import { purgeAgentSignups } from '../agents/purge.js';
import { startOngoingLoop } from '../leads/ongoing.js';
import { purge, RETENTION } from '../leads/retention.js';
import { startSeedLoop } from '../leads/seed/tick.js';
import { webSearchConfigured } from '../leads/sources/paid-search.js';
import { createSecrets } from '../crypto/secrets.js';
import { enrollTick } from '../sending/enroll.js';
import { smtpImapTransport } from '../sending/mailbox-transport.js';
import { pollTick } from '../sending/poller.js';
import { sendTick } from '../sending/sender.js';
import { VERSION } from '../version.js';
import { DELIVERY_BATCH, deliverDue } from '../webhooks/deliver.js';
import { httpSender } from '../webhooks/send.js';
import { createPipelineDeps } from './deps.js';
import { Runner } from './runner.js';

const FEED_TICK_MS = 60_000;
const WEBHOOK_TICK_MS = 2_000;
const SEND_TICK_MS = 30_000;
const POLL_TICK_MS = 60_000;
const ENROLL_TICK_MS = 60_000;

const env = loadEnv();
const log = logger('worker');

if (!env.DATABASE_URL) {
  log.error('DATABASE_URL is not set; the worker has nothing to do');
  process.exit(1);
}

const sql = getSql();
let stopping = false;
const deps = createPipelineDeps(sql, env, log);
const runner = new Runner(deps, { concurrency: env.WORKER_CONCURRENCY });
runner.start();

// Never short and ongoing: every 15 seconds, start fresh rounds for plain
// words searches that came up short, and the daily rounds of ongoing ones.
// Claims are atomic, so several workers share the work.
const stopOngoing = startOngoingLoop({
  sql,
  ai: deps.ai,
  log: log.child({ part: 'ongoing' }),
  runBraveBudget: env.ICP_BRAVE_BUDGET,
  dailyBraveBudget: env.ICP_DAILY_BRAVE_BUDGET,
  globalDailyBraveBudget: env.ONGOING_DAILY_BRAVE_BUDGET,
});

// The company seed: a few homepages a minute for the company index, off at SEED_DAILY_DOMAINS=0 (leads/seed/tick.ts).
startSeedLoop({ sql, crawl: deps.crawl, log: log.child({ part: 'seed' }), dailyDomains: env.SEED_DAILY_DOMAINS });

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

// Webhooks: every 2 seconds, send a batch of due deliveries. Claimed with
// SKIP LOCKED, so several workers share the work.
const send = httpSender({ allowPrivate: env.WEBHOOK_ALLOW_PRIVATE });
let webhooksBusy = false;
async function runWebhooks(): Promise<void> {
  if (webhooksBusy || stopping) return;
  webhooksBusy = true;
  try {
    // Keep going while batches come back full, so a big drop drains fast.
    for (let i = 0; i < 25 && !stopping; i++) {
      const r = await deliverDue({ sql, send, log });
      if (r.delivered + r.failed + r.retrying + r.skipped < DELIVERY_BATCH) break;
    }
  } catch (err) {
    log.error({ err }, 'webhook tick failed');
  } finally {
    webhooksBusy = false;
  }
}
const webhookTimer = setInterval(() => void runWebhooks(), WEBHOOK_TICK_MS);
webhookTimer.unref();

// Sending: enroll new leads into autopilot campaigns, send due steps, read
// replies. Each claims its rows with SKIP LOCKED, so several workers share
// the work. All off without SECRETS_KEY (no mailbox password can be opened),
// with SENDING_ENABLED=false or with nobody in SENDING_USERS. Sending is
// internal only: each tick touches the allowed users' rows and no others.
const sendingOn = Boolean(env.SECRETS_KEY) && env.SENDING_ENABLED && env.SENDING_USERS.length > 0;
const sendingTimers: NodeJS.Timeout[] = [];
// The sending ticks running now: shutdown waits for them, so a send between
// its claim and its confirm finishes before the database closes.
const sendingRuns = new Set<Promise<void>>();
if (sendingOn) {
  const sending = {
    sql,
    secrets: createSecrets(env.SECRETS_KEY!),
    transport: smtpImapTransport,
    log: log.child({ part: 'sending' }),
    publicApiUrl: env.PUBLIC_API_URL,
    enabled: true,
    users: env.SENDING_USERS,
    stopping: () => stopping,
  };
  const every = (name: string, ms: number, run: () => Promise<unknown>) => {
    let busy = false;
    const tick = async () => {
      if (busy || stopping) return;
      busy = true;
      try {
        await run();
      } catch (err) {
        log.error({ err }, `${name} tick failed`);
      } finally {
        busy = false;
      }
    };
    const track = () => {
      const run = tick();
      sendingRuns.add(run);
      void run.finally(() => sendingRuns.delete(run));
    };
    const timer = setInterval(track, ms);
    timer.unref();
    sendingTimers.push(timer);
  };
  every('enroll', ENROLL_TICK_MS, () => enrollTick(sql, sending.log, env.SENDING_USERS));
  every('send', SEND_TICK_MS, () => sendTick(sending));
  every('poll', POLL_TICK_MS, () => pollTick(sending));
}

log.info(
  {
    version: VERSION,
    env: env.NODE_ENV,
    workerId: runner.workerId,
    concurrency: env.WORKER_CONCURRENCY,
    web: webSearchConfigured(env),
    productHunt: Boolean(env.PRODUCT_HUNT_TOKEN),
    smtpProbe: env.SMTP_PROBE_ENABLED,
    sending: sendingOn,
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal, inFlight: runner.inFlight }, 'worker shutting down');
  clearInterval(purgeTimer);
  clearInterval(feedTimer);
  clearInterval(webhookTimer);
  for (const t of sendingTimers) clearInterval(t);
  stopOngoing();
  try {
    await Promise.all([runner.stop(25_000), Promise.allSettled([...sendingRuns])]);
  } finally {
    await closeSql();
    process.exit(0);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
