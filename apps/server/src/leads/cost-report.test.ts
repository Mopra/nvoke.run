import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { costReport, formatCostReport } from './cost-report.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.sql`insert into accounts (clerk_user_id) values ('u1')`;
  await db.sql`
    insert into searches (clerk_user_id, kind, "limit", source_requests, source_cache_hits, emails_valid, created_at) values
      ('u1', 'web', 100, 20, 5, 40, now()),
      ('u1', 'web', 100, 10, 15, 20, now()),
      ('u1', 'local', 50, 0, 0, 30, now()),
      ('u1', 'web', 100, 999, 0, 1, now() - interval '40 days')
  `;
  await db.sql`
    insert into ai_usage (clerk_user_id, task, model, cost_usd, created_at) values
      ('u1', 'plan', 'm', 0.02, now()),
      ('u1', 'people', 'm', 0.05, now()),
      ('u1', 'write', 'm', 1.00, now()),
      ('u1', 'fit', 'm', 9.00, now() - interval '40 days')
  `;
});
afterAll(async () => {
  await db.drop();
});

describe('costReport', () => {
  it('prices Brave per kind and adds only pipeline Claude tasks, inside the window', async () => {
    const r = await costReport(db.sql, 30, 5);
    expect(r.kinds.map((k) => [k.kind, k.braveRequests, k.valid])).toEqual([
      ['local', 0, 30],
      ['web', 30, 60],
    ]);
    expect(r.braveUsd).toBeCloseTo(0.15);
    expect(r.pipelineAiUsd).toBeCloseTo(0.07);
    expect(r.aiTasks.find((t) => t.task === 'write')?.inPipeline).toBe(false);
    expect(r.valid).toBe(90);
    expect(r.usdPer1000Valid).toBeCloseTo((0.22 * 1000) / 90);
    expect(r.braveCacheHitRate).toBeCloseTo(20 / 50);
    expect(formatCostReport(r)).toContain('cost per 1,000 valid $2.44');
  });

  it('says n/a when nothing ran', () => {
    const text = formatCostReport({
      days: 30,
      kinds: [],
      aiTasks: [],
      braveUsd: 0,
      pipelineAiUsd: 0,
      valid: 0,
      usdPer1000Valid: null,
      braveCacheHitRate: null,
    });
    expect(text).toContain('cost per 1,000 valid n/a');
    expect(text).toContain('brave cache hit rate n/a');
  });
});
