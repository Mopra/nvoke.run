import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { costReport, formatCostReport } from './cost-report.js';

let db: TestDb;
const NOW = new Date('2026-10-20T12:00:00Z');
const DAYS_AGO_40 = new Date('2026-09-10T12:00:00Z');
const PRICES = { brave: 5, serper: 1 };

beforeAll(async () => {
  db = await createTestDb();
  await db.sql`insert into accounts (clerk_user_id) values ('u1')`;
  await db.sql`
    insert into searches (clerk_user_id, kind, "limit", source_requests, source_cache_hits, emails_valid, created_at) values
      ('u1', 'web', 100, 20, 5, 40, ${NOW}),
      ('u1', 'web', 100, 10, 15, 20, ${NOW}),
      ('u1', 'local', 50, 0, 0, 30, ${NOW}),
      ('u1', 'web', 100, 999, 0, 1, ${DAYS_AGO_40})
  `;
  await db.sql`
    insert into ai_usage (clerk_user_id, task, model, cost_usd, created_at) values
      ('u1', 'plan', 'm', 0.02, ${NOW}),
      ('u1', 'people', 'm', 0.05, ${NOW}),
      ('u1', 'write', 'm', 1.00, ${NOW}),
      ('u1', 'fit', 'm', 9.00, ${DAYS_AGO_40})
  `;
});
afterAll(async () => {
  await db.drop();
});

describe('costReport', () => {
  it('prices the search counters at Brave before per provider counts, with pipeline Claude, inside the window', async () => {
    const r = await costReport(db.sql, 30, PRICES, NOW);
    expect(r.kinds.map((k) => [k.kind, k.paidRequests, k.valid])).toEqual([
      ['local', 0, 30],
      ['web', 30, 60],
    ]);
    expect(r.providers).toEqual([{ provider: 'brave', requests: 30, usd: 0.15 }]);
    expect(r.uncountedRequests).toBe(30);
    expect(r.searchUsd).toBeCloseTo(0.15);
    expect(r.pipelineAiUsd).toBeCloseTo(0.07);
    expect(r.aiTasks.find((t) => t.task === 'write')?.inPipeline).toBe(false);
    expect(r.valid).toBe(90);
    expect(r.usdPer1000Valid).toBeCloseTo((0.22 * 1000) / 90);
    expect(r.cacheHitRate).toBeCloseTo(20 / 50);
    const text = formatCostReport(r);
    expect(text).toContain('cost per 1,000 valid $2.44');
    expect(text).toContain("brave     requests 30  $0.15  (30 of them from the search counters, at Brave's price)");
  });

  it('prices each provider from web_search_usage, the uncounted rest at Brave, a partial month in proportion', async () => {
    // October: 25 counted per provider, 30 in the search counters, so 5 were Brave alone.
    await db.sql`insert into web_search_usage (provider, month, requests) values ('brave', '2026-10-01', 10), ('serper', '2026-10-01', 15)`;
    try {
      const r = await costReport(db.sql, 30, PRICES, NOW);
      expect(r.providers.map((p) => [p.provider, p.requests])).toEqual([
        ['brave', 15],
        ['serper', 15],
      ]);
      expect(r.searchUsd).toBeCloseTo(0.075 + 0.015);
      expect(r.kinds.find((k) => k.kind === 'web')?.searchUsd).toBeCloseTo(0.09);
      const text = formatCostReport(r);
      expect(text).toMatch(/serper +requests 15 {2}\$/);
      expect(text).toContain('web search $0.09 + pipeline claude $0.07 for 90 valid emails');

      // 10 days of the 19.5 October has had so far.
      const short = await costReport(db.sql, 10, PRICES, NOW);
      const share = 10 / 19.5;
      expect(short.providers.find((p) => p.provider === 'brave')?.requests).toBeCloseTo(15 * share);
      expect(short.providers.find((p) => p.provider === 'serper')?.requests).toBeCloseTo(15 * share);
      expect(short.searchUsd).toBeCloseTo(0.09 * share);
    } finally {
      await db.sql`delete from web_search_usage`;
    }
  });

  it('says n/a when nothing ran', () => {
    const text = formatCostReport({
      days: 30,
      kinds: [],
      providers: [{ provider: 'brave', requests: 0, usd: 0 }],
      uncountedRequests: 0,
      aiTasks: [],
      searchUsd: 0,
      pipelineAiUsd: 0,
      valid: 0,
      usdPer1000Valid: null,
      cacheHitRate: null,
    });
    expect(text).toContain('cost per 1,000 valid n/a');
    expect(text).toContain('web search cache hit rate n/a');
  });
});
