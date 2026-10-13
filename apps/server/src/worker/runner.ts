// The worker loop: claims jobs, runs them with a global concurrency cap (and
// smaller caps per type so slow SMTP or discovery work cannot starve
// crawling), retries with backoff, and shuts down cleanly.

import { hostname } from 'node:os';
import { PermanentError } from '../leads/sources/types.js';
import { sleep } from '../leads/limits.js';
import {
  maybeFinishSearch,
  onCrawlGaveUp,
  onFindGaveUp,
  onVerifyGaveUp,
  runCrawl,
  runFind,
  runVerify,
  type PipelineDeps,
} from './pipeline.js';
import { claim, complete, fail, release, requeueStale, type Job, type JobType } from './queue.js';

export interface RunnerOptions {
  concurrency: number;
  pollMs?: number;
  workerId?: string;
  /** Per job type wall clock limits. */
  timeoutsMs?: Partial<Record<JobType, number>>;
  /** Jobs running longer than this without finishing are assumed lost and requeued. Above the longest timeout. */
  staleAfterMs?: number;
}

const DEFAULT_TIMEOUTS: Record<JobType, number> = {
  // A domains search looks up up to 1,000 names at Brave's rate.
  find: 30 * 60_000,
  crawl: 3 * 60_000,
  verify: 2 * 60_000,
};

class ShutdownSignal extends Error {
  constructor() {
    super('worker shutting down');
    this.name = 'ShutdownSignal';
  }
}

interface Running {
  job: Job;
  controller: AbortController;
  done: Promise<void>;
}

export class Runner {
  private readonly running = new Map<string, Running>();
  private stopping = false;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private lastStaleSweep = 0;
  readonly workerId: string;
  private readonly caps: Record<JobType, number>;

  constructor(
    private readonly deps: PipelineDeps,
    private readonly opts: RunnerOptions,
  ) {
    this.workerId = opts.workerId ?? `${hostname()}:${process.pid}`;
    const n = opts.concurrency;
    this.caps = {
      find: Math.max(1, Math.min(2, Math.floor(n / 4))),
      verify: Math.max(1, Math.ceil(n / 2)),
      crawl: n,
    };
  }

  get inFlight(): number {
    return this.running.size;
  }

  start(): void {
    if (this.loop) return;
    this.loop = this.run();
  }

  /**
   * Stops claiming, waits up to graceMs for running jobs, then aborts the
   * rest and hands them back to the queue without spending an attempt.
   */
  async stop(graceMs = 25_000): Promise<void> {
    this.stopping = true;
    this.wake?.();
    await this.loop;
    const all = Promise.all([...this.running.values()].map((r) => r.done));
    const timedOut = await Promise.race([all.then(() => false), sleep(graceMs).then(() => true)]);
    if (timedOut) {
      for (const r of this.running.values()) r.controller.abort(new ShutdownSignal());
      await all;
    }
  }

  private async run(): Promise<void> {
    const pollMs = this.opts.pollMs ?? 1_000;
    while (!this.stopping) {
      let claimed = 0;
      try {
        await this.sweepStale();
        claimed = await this.fill();
      } catch (err) {
        this.deps.log.error({ err }, 'worker: claim failed');
      }
      if (claimed === 0 || this.running.size >= this.opts.concurrency) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, pollMs);
          this.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        this.wake = null;
      }
    }
  }

  private async sweepStale(): Promise<void> {
    if (Date.now() - this.lastStaleSweep < 60_000) return;
    this.lastStaleSweep = Date.now();
    const n = await requeueStale(this.deps.sql, this.opts.staleAfterMs ?? 35 * 60_000);
    if (n > 0) this.deps.log.warn({ jobs: n }, 'worker: requeued stale jobs');
  }

  private async fill(): Promise<number> {
    const counts: Record<JobType, number> = { find: 0, crawl: 0, verify: 0 };
    for (const r of this.running.values()) counts[r.job.type]++;
    let claimed = 0;
    // Verify gets its share before crawl takes whatever is left.
    for (const type of ['find', 'verify', 'crawl'] as const) {
      const free = this.opts.concurrency - this.running.size;
      const room = Math.min(free, this.caps[type] - counts[type]);
      if (room <= 0 || this.stopping) continue;
      const jobs = await claim(this.deps.sql, { workerId: this.workerId, limit: room, types: [type] });
      for (const job of jobs) this.launch(job);
      claimed += jobs.length;
    }
    return claimed;
  }

  private launch(job: Job): void {
    const controller = new AbortController();
    const timeout = this.opts.timeoutsMs?.[job.type] ?? DEFAULT_TIMEOUTS[job.type];
    const timer = setTimeout(() => controller.abort(new Error(`${job.type} job timed out after ${timeout} ms`)), timeout);
    const done = this.execute(job, controller.signal)
      .catch((err: unknown) => this.deps.log.error({ err, jobId: job.id }, 'worker: job bookkeeping failed'))
      .finally(() => {
        clearTimeout(timer);
        this.running.delete(job.id);
        this.wake?.();
      });
    this.running.set(job.id, { job, controller, done });
  }

  private async execute(job: Job, signal: AbortSignal): Promise<void> {
    const log = this.deps.log.child({ jobId: job.id, type: job.type, attempt: job.attempts });
    try {
      if (job.type === 'find') await runFind(this.deps, job, signal);
      else if (job.type === 'crawl') await runCrawl(this.deps, job, signal);
      else await runVerify(this.deps, job, signal);
      await complete(this.deps.sql, job.id);
    } catch (err) {
      if (signal.reason instanceof ShutdownSignal) {
        await release(this.deps.sql, job.id);
        log.info('worker: released job on shutdown');
        return;
      }
      const error = signal.aborted && signal.reason instanceof Error ? signal.reason : err;
      const message = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof PermanentError;
      const outcome = await fail(this.deps.sql, job, message, { permanent });
      log.warn({ err: message, outcome }, 'worker: job failed');
      if (outcome === 'failed') {
        if (job.type === 'find') await onFindGaveUp(this.deps, job, error);
        else if (job.type === 'crawl') await onCrawlGaveUp(this.deps, job);
        else await onVerifyGaveUp(this.deps, job);
      }
    }
    if (job.searchId) await maybeFinishSearch(this.deps.sql, job.searchId);
  }
}
