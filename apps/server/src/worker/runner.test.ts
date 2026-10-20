import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCampaign, seedLead, seedMailbox, testSecrets } from '../sending/test-seed.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import type { PipelineDeps } from './pipeline.js';
import { claim, enqueue } from './queue.js';
import { sweepStaleJobs } from './runner.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate jobs, campaigns, mailboxes, accounts cascade`;
});

describe('stale job sweep', () => {
  it('runs the write gave-up handler on a lost write job, so its leads fail and the campaign reaches review', async () => {
    const mailbox = await seedMailbox(db.sql, testSecrets());
    const campaign = await seedCampaign(db.sql, [mailbox], { status: 'writing' });
    const a = await seedLead(db.sql, campaign, mailbox, { address: 'anna@acme.io' });
    const b = await seedLead(db.sql, campaign, mailbox, { address: 'ben@beta.io' });
    await db.sql`update campaign_leads set status = 'writing' where campaign_id = ${campaign}`;
    await enqueue(db.sql, { type: 'write', payload: { campaignId: campaign, leadIds: [a, b] }, maxAttempts: 1 });
    const [job] = await claim(db.sql, { workerId: 'gone', limit: 1, types: ['write'] });
    await db.sql`update jobs set locked_at = now() - interval '1 hour' where id = ${job!.id}`;

    const deps = { sql: db.sql, log: silentLog } as unknown as PipelineDeps;
    expect(await sweepStaleJobs(deps, 15 * 60_000)).toEqual({ requeued: 0, failed: 1 });

    const leads = await db.sql<{ status: string }[]>`select status from campaign_leads where campaign_id = ${campaign}`;
    expect(leads.map((l) => l.status)).toEqual(['failed', 'failed']);
    const [row] = await db.sql<{ status: string }[]>`select status from campaigns where id = ${campaign}`;
    expect(row!.status).toBe('review');
  });

  it('only requeues a lost job that has attempts left', async () => {
    await enqueue(db.sql, { type: 'write', payload: { campaignId: 'c', leadIds: ['l'] } });
    const [job] = await claim(db.sql, { workerId: 'gone', limit: 1, types: ['write'] });
    await db.sql`update jobs set locked_at = now() - interval '1 hour' where id = ${job!.id}`;
    const deps = { sql: db.sql, log: silentLog } as unknown as PipelineDeps;
    expect(await sweepStaleJobs(deps, 15 * 60_000)).toEqual({ requeued: 1, failed: 0 });
  });
});
