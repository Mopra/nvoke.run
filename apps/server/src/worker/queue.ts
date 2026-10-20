// The Postgres job queue. Rows in `jobs`, claimed with FOR UPDATE SKIP LOCKED
// so any number of workers can poll without handing out a job twice.
//
// Lifecycle: queued -> running -> done | failed | canceled. A failed attempt
// goes back to queued with exponential backoff until max_attempts. A job whose
// worker died stays "running"; requeueStale puts it back after a while, or
// fails it when that was its last attempt.

import type { Sql, TransactionSql } from 'postgres';

export type JobType = 'find' | 'crawl' | 'verify' | 'opener' | 'people' | 'write' | 'fit';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export interface FindPayload {
  searchId: string;
}
export interface CrawlPayload {
  companyId: string;
}
export interface VerifyPayload {
  emailId: string;
  /** Greylisting retries so far. */
  retry?: number;
  /** Waiting for the company's other checks (checkPolicy); wakeDeferredChecks runs it early. */
  deferred?: boolean;
  /** How often and since when (ISO) it waited, so it stops at MAX_CHECK_DEFERS or MAX_CHECK_WAIT_MS. */
  defers?: number;
  deferredSince?: string;
  /**
   * How often and since when (ISO) it went back in the queue because we
   * could not probe (isCapacityDeferral), for the backoff and
   * CAPACITY_DEADLINE_MS. Not retries: those count server answers only.
   */
  capacityDefers?: number;
  capacitySince?: string;
  /** Set while it waits for capacity now, not for the server (greylisting) or the check policy. */
  capacity?: boolean;
}
export interface OpenerPayload {
  /** Up to OPENER_BATCH companies of one user, drafted in one Claude call. */
  companyIds: string[];
}
export interface PeoplePayload {
  companyId: string;
  /** Greylisting retries so far. */
  retry?: number;
  /** Capacity waits so far and since when (ISO), as on VerifyPayload. Not retries. */
  capacityDefers?: number;
  capacitySince?: string;
}
export interface WritePayload {
  /** Up to WRITE_BATCH leads of one campaign, written by Claude in one job (sending/write.ts). */
  campaignId: string;
  leadIds: string[];
}
export interface FitPayload {
  searchId: string;
  /** Crawled companies of the search waiting for their fit (companies.fit_state 'pending'), scored together. */
  companyIds: string[];
}
export type JobPayload = FindPayload | CrawlPayload | VerifyPayload | OpenerPayload | PeoplePayload | WritePayload | FitPayload;

export interface Job {
  /** bigint, kept as a string. */
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  searchId: string | null;
  attempts: number;
  maxAttempts: number;
}

export interface NewJob {
  type: JobType;
  payload: JobPayload;
  searchId?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
  /** Higher runs first among runnable jobs of a type. 0 when left out. */
  priority?: number;
}

/**
 * How soon an address is checked: decision makers first, then other named
 * people, then personal addresses, role inboxes last.
 */
export function verifyPriority(e: { kind: string; seniority?: string | null; first_name?: string | null }): number {
  if (e.seniority === 'founder' || e.seniority === 'executive' || e.seniority === 'director') return 30;
  if (e.first_name) return 20;
  return e.kind === 'personal' ? 10 : 0;
}

type Db = Sql | TransactionSql;

interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  search_id: string | null;
  attempts: number;
  max_attempts: number;
}

function toJob(r: JobRow): Job {
  return {
    id: String(r.id),
    type: r.type,
    payload: r.payload,
    searchId: r.search_id,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
  };
}

export async function enqueue(sql: Db, jobs: NewJob | NewJob[]): Promise<void> {
  const list = Array.isArray(jobs) ? jobs : [jobs];
  if (list.length === 0) return;
  const rows = list.map((j) => ({
    type: j.type,
    payload: sql.json(j.payload as unknown as Parameters<typeof sql.json>[0]),
    search_id: j.searchId ?? null,
    run_after: j.runAfter ?? new Date(),
    max_attempts: j.maxAttempts ?? 3,
    priority: j.priority ?? 0,
  }));
  await sql`insert into jobs ${sql(rows, 'type', 'payload', 'search_id', 'run_after', 'max_attempts', 'priority')}`;
}

/**
 * Claims up to `limit` runnable jobs of the given types, highest priority
 * then oldest first, and
 * marks them running. Safe to call from many workers at once.
 */
export async function claim(sql: Db, opts: { workerId: string; limit: number; types: JobType[] }): Promise<Job[]> {
  if (opts.limit <= 0 || opts.types.length === 0) return [];
  const rows = await sql<JobRow[]>`
    update jobs j
    set status = 'running', locked_at = now(), locked_by = ${opts.workerId}, attempts = j.attempts + 1
    where j.id in (
      select id from jobs
      where status = 'queued' and run_after <= now() and type = any(${opts.types})
      order by priority desc, run_after, id
      limit ${opts.limit}
      for update skip locked
    )
    returning j.id::text as id, j.type, j.payload, j.search_id, j.attempts, j.max_attempts
  `;
  return rows.map(toJob);
}

export async function complete(sql: Db, jobId: string): Promise<void> {
  await sql`
    update jobs set status = 'done', finished_at = now(), locked_at = null
    where id = ${jobId} and status = 'running'
  `;
}

/** 5 s, 20 s, 80 s, ... with up to 20 percent jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 5_000 * 4 ** Math.max(0, attempt - 1);
  return Math.round(base * (1 + random() * 0.2));
}

/**
 * Records a failed attempt. Returns "retry" when the job went back to the
 * queue and "failed" when it is out of attempts (or the error is permanent).
 */
export async function fail(
  sql: Db,
  job: Job,
  error: string,
  opts: { permanent?: boolean; random?: () => number } = {},
): Promise<'retry' | 'failed'> {
  const message = error.slice(0, 2_000);
  if (opts.permanent || job.attempts >= job.maxAttempts) {
    await sql`
      update jobs set status = 'failed', last_error = ${message}, finished_at = now(), locked_at = null
      where id = ${job.id}
    `;
    return 'failed';
  }
  const delay = backoffMs(job.attempts, opts.random);
  await sql`
    update jobs
    set status = 'queued', last_error = ${message}, locked_at = null, locked_by = null,
        run_after = now() + ${delay} * interval '1 millisecond'
    where id = ${job.id}
  `;
  return 'retry';
}

/**
 * Puts a running job back in the queue for later, with a new payload and
 * without spending an attempt: the same row, so a check that waits many
 * times leaves one job behind, not one per wait. False when the job is not
 * running here (the caller then enqueues a fresh one).
 */
export async function requeue(sql: Db, jobId: string, payload: JobPayload, runAfter: Date): Promise<boolean> {
  if (!/^\d+$/.test(jobId)) return false;
  const rows = await sql`
    update jobs
    set status = 'queued', payload = ${sql.json(payload as unknown as Parameters<typeof sql.json>[0])}, run_after = ${runAfter},
        attempts = greatest(0, attempts - 1), locked_at = null, locked_by = null
    where id = ${jobId} and status = 'running'
    returning id
  `;
  return rows.length > 0;
}

export interface QueuedChecks {
  /**
   * Addresses of the search not settled yet: a verify job queued or running
   * for each, plus the unchecked addresses of companies waiting for their
   * fit (at least one per company, for the people job it may get).
   */
  queued: number;
  /** Of those, the ones waiting because we could not probe (port 25, lanes full, throttled), not for the server or the check policy. */
  capacity: number;
}

/**
 * The search's checks still to come. A search with checks queued is not
 * finished, and the ones waiting for capacity or for their company's fit
 * will come back with an answer: an escalation that counts them as lost
 * would buy companies for nothing.
 */
export async function queuedChecks(sql: Db, searchId: string): Promise<QueuedChecks> {
  const [row] = await sql<QueuedChecks[]>`
    select
      (select count(*)::int from jobs where search_id = ${searchId} and type = 'verify' and status in ('queued', 'running'))
      + (select coalesce(sum(greatest(1, (
          select count(*) from emails e where e.company_id = c.id and e.verification is null and e.skipped is null
        ))), 0)::int from companies c where c.search_id = ${searchId} and c.fit_state = 'pending') as queued,
      (select count(*)::int from jobs
        where search_id = ${searchId} and type = 'verify' and status in ('queued', 'running') and payload->>'capacity' = 'true') as capacity
  `;
  return row ?? { queued: 0, capacity: 0 };
}

/** How long the first crawled company of a batch waits for others before the fit job scores what it has. */
export const FIT_WAIT_MS = 15_000;
/** Companies a fit job waits for before it runs at once: one fit call (leads/fit.ts FIT_BATCH). */
export const FIT_JOB_BATCH = 30;

/**
 * Hands crawled companies to the search's queued fit job, or queues one.
 * The job runs FIT_WAIT_MS after its first company, or at once when it holds
 * FIT_JOB_BATCH. A job already running keeps the companies it was given, so
 * no company is scored twice. Call it after the transaction updated the
 * search row, which serializes the crawls of one search.
 */
export async function queueFit(sql: Db, searchId: string, companyIds: string[], waitMs: number = FIT_WAIT_MS): Promise<void> {
  if (companyIds.length === 0) return;
  const [joined] = await sql`
    update jobs set
      payload = jsonb_set(payload, '{companyIds}', coalesce(payload->'companyIds', '[]'::jsonb) || ${sql.json(companyIds)}),
      run_after = case
        when jsonb_array_length(coalesce(payload->'companyIds', '[]'::jsonb)) + ${companyIds.length} >= ${FIT_JOB_BATCH} then least(run_after, now())
        else run_after
      end
    where id = (
      select id from jobs where search_id = ${searchId} and type = 'fit' and status = 'queued'
      order by id limit 1
      for update skip locked
    )
    returning id
  `;
  if (joined) return;
  const runAfter = new Date(Date.now() + (companyIds.length >= FIT_JOB_BATCH ? 0 : waitMs));
  await enqueue(sql, { type: 'fit', payload: { searchId, companyIds }, searchId, runAfter });
}

/** Hands a claimed job back without spending an attempt (used on shutdown). */
export async function release(sql: Db, jobId: string): Promise<void> {
  await sql`
    update jobs
    set status = 'queued', attempts = greatest(0, attempts - 1), locked_at = null, locked_by = null
    where id = ${jobId} and status = 'running'
  `;
}

export interface StaleSweep {
  /** Jobs put back in the queue for another attempt. */
  requeued: number;
  /** Jobs out of attempts, now failed. The caller runs their gave-up handlers. */
  failed: Job[];
}

/**
 * Requeues jobs whose worker vanished. Each one still counts the attempt it
 * was on, so a job that was on its last attempt fails here and comes back in
 * `failed`.
 */
export async function requeueStale(sql: Db, olderThanMs: number): Promise<StaleSweep> {
  const rows = await sql<(JobRow & { status: JobStatus })[]>`
    update jobs
    set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
        last_error = coalesce(last_error, 'worker lost the job'),
        locked_at = null, locked_by = null,
        finished_at = case when attempts >= max_attempts then now() else null end
    where status = 'running' and locked_at < now() - ${olderThanMs} * interval '1 millisecond'
    returning id::text as id, type, payload, search_id, attempts, max_attempts, status
  `;
  const failed = rows.filter((r) => r.status === 'failed').map(toJob);
  return { requeued: rows.length - failed.length, failed };
}

/** Cancels every queued job of a search, optionally only some types. */
export async function cancelSearchJobs(sql: Db, searchId: string, types?: JobType[]): Promise<number> {
  const rows = types
    ? await sql`
        update jobs set status = 'canceled', finished_at = now()
        where search_id = ${searchId} and status = 'queued' and type = any(${types})
        returning id`
    : await sql`
        update jobs set status = 'canceled', finished_at = now()
        where search_id = ${searchId} and status = 'queued'
        returning id`;
  return rows.length;
}
