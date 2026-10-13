import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { backoffMs, cancelSearchJobs, claim, complete, enqueue, fail, release, requeueStale, type Job } from './queue.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate jobs, searches, accounts cascade`;
});

async function jobRow(id: string) {
  const [row] = await db.sql<{ status: string; attempts: number; last_error: string | null; run_after: Date; locked_by: string | null }[]>`
    select status, attempts, last_error, run_after, locked_by from jobs where id = ${id}
  `;
  return row!;
}

async function search(): Promise<string> {
  await db.sql`insert into accounts (clerk_user_id) values ('u1') on conflict do nothing`;
  const [row] = await db.sql<{ id: string }[]>`insert into searches (clerk_user_id, kind, "limit") values ('u1', 'local', 10) returning id`;
  return row!.id;
}

describe('job queue', () => {
  it('claims queued jobs oldest first and marks them running', async () => {
    await enqueue(db.sql, [
      { type: 'crawl', payload: { companyId: 'a' } },
      { type: 'crawl', payload: { companyId: 'b' } },
      { type: 'verify', payload: { emailId: 'c' } },
    ]);
    const jobs = await claim(db.sql, { workerId: 'w1', limit: 10, types: ['crawl'] });
    expect(jobs.map((j) => j.payload)).toEqual([{ companyId: 'a' }, { companyId: 'b' }]);
    expect(jobs[0]).toMatchObject({ type: 'crawl', attempts: 1, maxAttempts: 3 });
    expect((await jobRow(jobs[0]!.id)).status).toBe('running');
    expect((await jobRow(jobs[0]!.id)).locked_by).toBe('w1');
    expect(await claim(db.sql, { workerId: 'w1', limit: 10, types: ['crawl'] })).toEqual([]);
  });

  it('never hands the same job to two concurrent workers (SKIP LOCKED)', async () => {
    await enqueue(
      db.sql,
      Array.from({ length: 60 }, (_, i) => ({ type: 'crawl' as const, payload: { companyId: String(i) } })),
    );
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claim(db.sql, { workerId: `w${i}`, limit: 10, types: ['crawl'] })),
    );
    const ids = claims.flat().map((j) => j.id);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
  });

  it('does not claim jobs scheduled for later', async () => {
    await enqueue(db.sql, { type: 'find', payload: { searchId: 'x' }, runAfter: new Date(Date.now() + 60_000) });
    expect(await claim(db.sql, { workerId: 'w', limit: 5, types: ['find'] })).toEqual([]);
  });

  it('retries with exponential backoff, then fails for good after max attempts', async () => {
    await enqueue(db.sql, { type: 'crawl', payload: { companyId: 'x' } });
    let [job] = await claim(db.sql, { workerId: 'w', limit: 1, types: ['crawl'] });
    const before = Date.now();
    expect(await fail(db.sql, job!, 'boom 1', { random: () => 0 })).toBe('retry');
    let row = await jobRow(job!.id);
    expect(row.status).toBe('queued');
    expect(row.last_error).toBe('boom 1');
    expect(row.run_after.getTime() - before).toBeGreaterThanOrEqual(4_000);

    // Fast-forward: make it runnable again, twice.
    for (const attempt of [2, 3]) {
      await db.sql`update jobs set run_after = now() where id = ${job!.id}`;
      [job] = await claim(db.sql, { workerId: 'w', limit: 1, types: ['crawl'] });
      expect(job!.attempts).toBe(attempt);
      const outcome = await fail(db.sql, job!, `boom ${attempt}`);
      expect(outcome).toBe(attempt < 3 ? 'retry' : 'failed');
    }
    row = await jobRow(job!.id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(3);
  });

  it('fails permanent errors on the first attempt', async () => {
    await enqueue(db.sql, { type: 'find', payload: { searchId: 'x' } });
    const [job] = await claim(db.sql, { workerId: 'w', limit: 1, types: ['find'] });
    expect(await fail(db.sql, job!, 'no key', { permanent: true })).toBe('failed');
  });

  it('computes backoff of 5 s, 20 s, 80 s', () => {
    expect([1, 2, 3].map((a) => backoffMs(a, () => 0))).toEqual([5_000, 20_000, 80_000]);
    expect(backoffMs(1, () => 1)).toBe(6_000);
  });

  it('completes, releases without spending an attempt, and requeues stale jobs', async () => {
    await enqueue(db.sql, [
      { type: 'crawl', payload: { companyId: 'done' } },
      { type: 'crawl', payload: { companyId: 'released' } },
      { type: 'crawl', payload: { companyId: 'stale' } },
    ]);
    const [a, b, c] = (await claim(db.sql, { workerId: 'w', limit: 3, types: ['crawl'] })) as [Job, Job, Job];
    await complete(db.sql, a.id);
    expect((await jobRow(a.id)).status).toBe('done');

    await release(db.sql, b.id);
    expect(await jobRow(b.id)).toMatchObject({ status: 'queued', attempts: 0 });

    await db.sql`update jobs set locked_at = now() - interval '1 hour' where id = ${c.id}`;
    expect(await requeueStale(db.sql, 15 * 60_000)).toBe(1);
    expect(await jobRow(c.id)).toMatchObject({ status: 'queued', attempts: 1, last_error: 'worker lost the job' });
  });

  it('cancels the queued jobs of one search', async () => {
    const s1 = await search();
    const s2 = await search();
    await enqueue(db.sql, [
      { type: 'crawl', payload: { companyId: '1' }, searchId: s1 },
      { type: 'verify', payload: { emailId: '2' }, searchId: s1 },
      { type: 'crawl', payload: { companyId: '3' }, searchId: s2 },
    ]);
    expect(await cancelSearchJobs(db.sql, s1, ['crawl'])).toBe(1);
    expect(await cancelSearchJobs(db.sql, s1)).toBe(1);
    const left = await claim(db.sql, { workerId: 'w', limit: 10, types: ['crawl', 'verify'] });
    expect(left.map((j) => j.searchId)).toEqual([s2]);
  });
});
