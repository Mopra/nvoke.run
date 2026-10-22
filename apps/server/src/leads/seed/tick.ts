// The seed tick (docs/research/company-seed.md). Every minute the worker
// crawls a few queued seed_domains with the pipeline's crawler (robots.txt on
// every hop, one request per second per host, the shared limiter) and keeps
// their pages in the shared crawl cache, where the company index
// (company-index.ts) finds them for the next Sonar search.
//
// It stays out of the way of users:
// - At most SEED_DAILY_DOMAINS crawls in any 24 hours, spread over the day.
// - No crawl while a user's find, crawl or fit job waits in the queue.
// - Its own loop, never a job: the runner's slots stay with searches.
// - No email is verified: SMTP pacing is untouched.
// - The domain stays due for a recrawl, so a search that picks it crawls it
//   in full (more pages, the people step) rather than reading the seed's.
//
// What users search for goes first: every SEED_RESCORE_MS the loop reads the
// recent Sonar plans and, when they changed, rescores the queue (demand.ts).

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { crawlSite, type CrawlDeps, type CrawlResult } from '../crawl.js';
import { isCacheable, recordCrawl } from '../domain-cache.js';
import { isDomainSuppressed, suppressedAddresses } from '../suppression.js';
import { demandKey, rescoreSeed, seedDemand } from './demand.js';

export const SEED_TICK_MS = 60_000;
/** How often the loop looks for new Sonar plans to rescore the queue by. */
export const SEED_RESCORE_MS = 60 * 60_000;
/** Crawls one tick makes at most, whatever the daily rate. */
const MAX_PER_TICK = 12;
/** Crawls at once within a tick. */
const CONCURRENCY = 4;
/** Pages a seed crawl reads: the homepage and what describes the business. The index keeps 3. */
const SEED_MAX_PAGES = 4;
const CRAWL_TIMEOUT_MS = 60_000;
/** A claimed domain whose worker died goes back in the queue after this. */
const STALE_MS = 30 * 60_000;
/** User jobs that make the seed wait. */
const USER_JOB_TYPES = ['find', 'crawl', 'fit'];

export interface SeedDeps {
  sql: Sql;
  crawl: CrawlDeps;
  log: Logger;
  /** Crawls a day at most (SEED_DAILY_DOMAINS). 0 is off. */
  dailyDomains: number;
  /** Tests stand in for the crawler. */
  crawlSite?: (website: string, domain: string, signal: AbortSignal) => Promise<CrawlResult>;
  now?: () => Date;
}

export interface SeedTick {
  crawled: number;
  skipped: number;
  /** Why nothing ran: off, users' jobs waiting, or the day's crawls spent. */
  waited?: 'off' | 'busy' | 'daily_cap';
}

/** Crawls this tick may make: the day's rate per minute, rounded up, within what the last 24 hours left. */
export function seedBatchSize(dailyDomains: number, lastDay: number, tickMs = SEED_TICK_MS): number {
  const room = dailyDomains - lastDay;
  if (room <= 0) return 0;
  return Math.min(room, MAX_PER_TICK, Math.ceil((dailyDomains * tickMs) / 86_400_000));
}

export async function seedTick(deps: SeedDeps): Promise<SeedTick> {
  const { sql, log } = deps;
  const now = deps.now?.() ?? new Date();
  if (deps.dailyDomains <= 0) return { crawled: 0, skipped: 0, waited: 'off' };

  const [waiting] = await sql<{ n: number }[]>`
    select count(*)::int as n from jobs
    where status = 'queued' and type = any(${USER_JOB_TYPES}::text[]) and run_after <= ${now}
  `;
  if (waiting!.n > 0) return { crawled: 0, skipped: 0, waited: 'busy' };

  await sql`
    update seed_domains set status = 'queued', claimed_at = null
    where status = 'running' and claimed_at < ${new Date(now.getTime() - STALE_MS)}
  `;
  const [day] = await sql<{ n: number }[]>`
    select count(*)::int as n from seed_domains where crawled_at > ${new Date(now.getTime() - 86_400_000)}
  `;
  const size = seedBatchSize(deps.dailyDomains, day!.n);
  if (size === 0) return { crawled: 0, skipped: 0, waited: 'daily_cap' };

  const claimed = await sql<{ domain: string }[]>`
    update seed_domains set status = 'running', claimed_at = ${now}
    where domain in (
      select domain from seed_domains where status = 'queued'
      order by score desc, rank nulls last, domain
      limit ${size}
      for update skip locked
    )
    returning domain
  `;
  const out: SeedTick = { crawled: 0, skipped: 0 };
  const queue = claimed.map((r) => r.domain);
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let domain = queue.shift(); domain; domain = queue.shift()) {
      const outcome = await seedOne(deps, domain).catch((err: unknown) => {
        log.warn({ err, domain }, 'seed: crawl failed');
        return 'error' as const;
      });
      if (outcome === 'suppressed' || outcome === 'known') {
        out.skipped++;
        await sql`update seed_domains set status = 'skipped', outcome = ${outcome}, claimed_at = null where domain = ${domain}`;
      } else {
        out.crawled++;
        await sql`
          update seed_domains set status = 'done', outcome = ${outcome}, crawled_at = ${deps.now?.() ?? new Date()}
          where domain = ${domain}
        `;
      }
    }
  });
  await Promise.all(workers);
  if (claimed.length > 0) log.info(out, 'seed: tick done');
  return out;
}

/** Crawls one seed domain into the crawl cache. Its outcome, or why it was skipped. */
async function seedOne(deps: SeedDeps, domain: string): Promise<CrawlResult['status'] | 'suppressed' | 'known' | 'error'> {
  const { sql } = deps;
  if (await isDomainSuppressed(sql, domain)) return 'suppressed';
  // A search crawled it since the import: its crawl is the better one.
  const [fresh] = await sql`select 1 from domains where domain = ${domain}`;
  if (fresh) return 'known';

  const signal = AbortSignal.timeout(CRAWL_TIMEOUT_MS);
  const website = `https://${domain}/`;
  const result = deps.crawlSite
    ? await deps.crawlSite(website, domain, signal)
    : await crawlSite(website, domain, deps.crawl, { signal, maxPages: SEED_MAX_PAGES });

  const blocked = await suppressedAddresses(sql, result.emails.map((e) => e.address));
  const found = result.emails.filter((e) => !blocked.has(e.address));
  const at = deps.now?.() ?? new Date();
  const recorded = await sql.begin(async (tx) => {
    const [taken] = await tx`select 1 from domains where domain = ${domain} for update`;
    if (taken) return false;
    await recordCrawl(
      tx,
      domain,
      {
        status: result.status,
        hasPersonal: found.some((e) => !isCacheable(e, domain)),
        generic: found.filter((e) => isCacheable(e, domain)).map((e) => ({ address: e.address, sourceUrl: e.sourceUrl })),
        texts: result.texts,
      },
      at,
    );
    // Due at once: the pages feed the index, but a search still crawls the domain itself.
    await tx`update domains set recheck_at = crawled_at where domain = ${domain}`;
    return true;
  });
  return recorded ? result.status : 'known';
}

/** Runs seedTick every SEED_TICK_MS in the worker. Off (no timer) when dailyDomains is 0. Returns stop. */
export function startSeedLoop(deps: SeedDeps): () => void {
  if (deps.dailyDomains <= 0) return () => {};
  let busy = false;
  let lastDemand: string | undefined;
  let demandAt = 0;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    const rescore = async () => {
      if (Date.now() - demandAt < SEED_RESCORE_MS) return;
      demandAt = Date.now();
      const demand = await seedDemand(deps.sql);
      const key = demandKey(demand);
      if (key === lastDemand) return;
      const rescored = await rescoreSeed(deps.sql, demand);
      lastDemand = key;
      deps.log.info({ plans: demand.plans, words: demand.words.size, tlds: demand.tlds.size, rescored }, 'seed: rescored by demand');
    };
    rescore()
      .catch((err: unknown) => deps.log.error({ err }, 'seed rescore failed'))
      .then(() => seedTick(deps))
      .catch((err: unknown) => deps.log.error({ err }, 'seed tick failed'))
      .finally(() => {
        busy = false;
      });
  }, SEED_TICK_MS);
  timer.unref();
  deps.log.info({ dailyDomains: deps.dailyDomains }, 'seed: on');
  return () => clearInterval(timer);
}
