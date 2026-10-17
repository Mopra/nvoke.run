import { describe, expect, it } from 'vitest';
import {
  entryMetrics,
  isDecisionMaker,
  renderReport,
  sample,
  samplePreferring,
  seededRng,
  seedOf,
  snapshotMarks,
  totalMetrics,
  type CompanyRow,
  type EmailRow,
  type EvalRun,
  type SearchUsage,
} from './eval-metrics.js';

const started = new Date('2026-10-17T10:00:00Z');
const at = new Date('2026-10-17T10:20:00Z');

const company = (id: string, searchId: string, crawlStatus = 'done'): CompanyRow => ({ id, searchId, crawlStatus });
const email = (companyId: string, searchId: string, over: Partial<EmailRow> = {}): EmailRow => ({
  companyId,
  searchId,
  kind: 'generic',
  verification: null,
  name: null,
  title: null,
  seniority: null,
  foundVia: null,
  ...over,
});
const search = (searchId: string, over: Partial<SearchUsage> = {}): SearchUsage => ({
  searchId,
  kind: 'web',
  sourceRequests: 0,
  sourceCacheHits: 0,
  status: 'running',
  finishedAt: null,
  ...over,
});

describe('seeded sampling', () => {
  it('gives the same sample for the same label', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const a = sample(items, 10, seededRng(seedOf('baseline')));
    const b = sample(items, 10, seededRng(seedOf('baseline')));
    const c = sample(items, 10, seededRng(seedOf('other')));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBe(10);
    expect(items).toHaveLength(100);
  });

  it('returns everything when asked for more than there is', () => {
    expect(sample([1, 2, 3], 10, seededRng(1)).sort()).toEqual([1, 2, 3]);
  });

  it('prefers matching items and tops up with the rest', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const even = samplePreferring(items, 2, seededRng(2), (n) => n % 2 === 0);
    expect(even.every((n) => n % 2 === 0)).toBe(true);
    const topped = samplePreferring(items, 5, seededRng(2), (n) => n % 2 === 0);
    expect(topped.slice(0, 3).sort()).toEqual([2, 4, 6]);
    expect(topped).toHaveLength(5);
  });
});

describe('entryMetrics', () => {
  const companies = [company('c1', 's1'), company('c2', 's1'), company('c3', 's2', 'pending'), company('x1', 'other')];
  const emails = [
    email('c1', 's1', { verification: 'valid', kind: 'personal', name: 'Anna Berg', title: 'Founder', seniority: 'founder', foundVia: 'pattern' }),
    email('c1', 's1', { verification: 'catch_all', kind: 'personal', name: 'Bo Lund', title: 'Office manager', seniority: 'manager', foundVia: 'pattern' }),
    email('c2', 's1', { verification: 'invalid' }),
    email('c2', 's1', { verification: 'valid' }),
    email('c2', 's1'),
    email('x1', 'other', { verification: 'valid' }),
  ];
  const m = entryMetrics({
    entryId: 'e',
    companies,
    emails,
    searches: [search('s1', { sourceRequests: 4, sourceCacheHits: 6, status: 'done', finishedAt: '2026-10-17T10:05:00Z' }), search('s2')],
    aiCostUsd: 0.02,
    braveCostPer1000Usd: 5,
    startedAt: started,
    at,
  });

  it('counts companies and emails of its own searches only', () => {
    expect(m).toMatchObject({ companies: 3, companiesCrawled: 2, companiesWithEmail: 2, emails: 5, personal: 2, generic: 3 });
  });

  it('counts verification outcomes and the rate over checked addresses', () => {
    expect(m).toMatchObject({ valid: 2, catchAll: 1, invalid: 1, unknown: 0, pending: 1, validPersonal: 1, validNamed: 1 });
    expect(m.validRate).toBeCloseTo(0.5);
  });

  it('counts named, titled and decision makers', () => {
    expect(m).toMatchObject({ named: 2, titled: 2, decisionMakers: 1, pattern: 2, validPattern: 1 });
  });

  it('prices Brave as if uncached and as paid', () => {
    expect(m.braveRequests).toBe(4);
    expect(m.braveCacheHits).toBe(6);
    expect(m.braveCostUsd).toBeCloseTo(0.05);
    expect(m.bravePaidUsd).toBeCloseTo(0.02);
    expect(m.costPerValidUsd).toBeCloseTo((0.05 + 0.02) / 2);
  });

  it('runs the clock until the snapshot while a search is open, else until the last one ended', () => {
    expect(m.elapsedMinutes).toBeCloseTo(20);
    expect(m.searchesEnded).toBe(1);
    const done = entryMetrics({
      entryId: 'e',
      companies,
      emails,
      searches: [search('s1', { status: 'done', finishedAt: '2026-10-17T10:05:00Z' }), search('s2', { status: 'failed', finishedAt: '2026-10-17T10:08:00Z' })],
      aiCostUsd: 0,
      braveCostPer1000Usd: 5,
      startedAt: started,
      at,
    });
    expect(done.elapsedMinutes).toBeCloseTo(8);
  });

  it('has no cost per valid email without a valid one', () => {
    const none = entryMetrics({ entryId: 'e', companies: [], emails: [], searches: [search('s1')], aiCostUsd: 0, braveCostPer1000Usd: 5, startedAt: started, at });
    expect(none.costPerValidUsd).toBeNull();
    expect(none.validRate).toBe(0);
  });
});

describe('totalMetrics', () => {
  it('sums counts and costs and recomputes the rates', () => {
    const base = { companies: [], emails: [], aiCostUsd: 0.01, braveCostPer1000Usd: 5, startedAt: started, at };
    const a = entryMetrics({
      ...base,
      entryId: 'a',
      companies: [company('c1', 's1')],
      emails: [email('c1', 's1', { verification: 'valid' }), email('c1', 's1', { verification: 'invalid' })],
      searches: [search('s1', { sourceRequests: 2 })],
    });
    const b = entryMetrics({ ...base, entryId: 'b', companies: [company('c2', 's2')], emails: [email('c2', 's2', { verification: 'valid' })], searches: [search('s2')] });
    const t = totalMetrics([a, b]);
    expect(t).toMatchObject({ entryId: 'total', companies: 2, emails: 3, valid: 2, invalid: 1, braveRequests: 2 });
    expect(t.aiCostUsd).toBeCloseTo(0.02);
    expect(t.validRate).toBeCloseTo(2 / 3);
    expect(t.costPerValidUsd).toBeCloseTo((0.01 + 0.02) / 2);
  });
});

describe('isDecisionMaker', () => {
  it('reads seniority first, then the title', () => {
    expect(isDecisionMaker({ seniority: 'founder', title: null })).toBe(true);
    expect(isDecisionMaker({ seniority: 'executive', title: null })).toBe(true);
    expect(isDecisionMaker({ seniority: 'director', title: null })).toBe(true);
    expect(isDecisionMaker({ seniority: 'manager', title: 'Managing partner' })).toBe(false);
    expect(isDecisionMaker({ seniority: 'staff', title: 'Assistant' })).toBe(false);
    expect(isDecisionMaker({ seniority: null, title: 'Co-founder & CEO' })).toBe(true);
    expect(isDecisionMaker({ seniority: null, title: 'Geschäftsführer' })).toBe(true);
    expect(isDecisionMaker({ seniority: null, title: 'Dental hygienist' })).toBe(false);
  });
});

describe('snapshotMarks', () => {
  it('keeps the marks before the end; the end gets its own snapshot', () => {
    expect(snapshotMarks(60)).toEqual([15, 30]);
    expect(snapshotMarks(90)).toEqual([15, 30, 60]);
    expect(snapshotMarks(4)).toEqual([]);
  });
});

describe('renderReport', () => {
  const m = entryMetrics({
    entryId: 'nvoke-customers',
    companies: [company('c1', 's1')],
    emails: [email('c1', 's1', { verification: 'valid', kind: 'personal' })],
    searches: [search('s1', { sourceRequests: 1, sourceCacheHits: 1, status: 'done', finishedAt: '2026-10-17T10:03:00Z' })],
    aiCostUsd: 0,
    braveCostPer1000Usd: 5,
    startedAt: started,
    at,
  });
  const run: EvalRun = {
    label: 'smoke',
    startedAt: started.toISOString(),
    finishedAt: at.toISOString(),
    minutes: 4,
    smtpPerMinute: 5,
    braveCostPer1000Usd: 5,
    database: 'nvoke_eval_x',
    personColumns: [],
    entries: [],
    snapshots: [{ atMinutes: 3, final: true, entries: [m], totals: totalMetrics([m]) }],
    brave: { seeded: 0, dumped: 1 },
    judges: {
      costUsd: 0.04,
      entries: [
        {
          entryId: 'nvoke-customers',
          icp: { verdicts: [{ companyId: 'c1', name: 'Acme', domain: 'acme.io', fit: 2, reason: 'agency' }], meanFit: 2, clearFitShare: 1, costUsd: 0.001 },
          wouldEmail: {
            verdicts: [
              {
                address: 'anna@acme.io',
                kind: 'personal',
                name: 'Anna',
                title: 'CEO',
                company: 'Acme | Leads',
                domain: 'acme.io',
                verification: 'valid',
                yes: true,
                reason: 'named founder',
              },
            ],
            yes: 1,
            sampled: 1,
            costUsd: 0.03,
          },
        },
      ],
    },
  };
  const md = renderReport(run);

  it('renders a table per snapshot with a totals row', () => {
    expect(md).toContain('## End, 3.0 min');
    expect(md).toContain('| nvoke-customers | 3.0 | 1/1 | 1 | 1 | 1 | 1 | 1/0 | 0/0/0 | 1 | 100% | 0/0/0/0 | 1/0 | 0/0 |');
    expect(md).toContain('| **total** |');
    expect(md).toContain('1+1');
  });

  it('renders the judges and the dogfood would-email sample, escaping pipes', () => {
    expect(md).toContain('| nvoke-customers | 2.00 | 100% of 1 | 1/1 |');
    expect(md).toContain('### Would email: nvoke-customers');
    expect(md).toContain('| yes | anna@acme.io (Anna, CEO) | personal | valid | Acme / Leads (acme.io) | named founder |');
  });

  it('leaves the judges out when they did not run', () => {
    expect(renderReport({ ...run, judges: null })).not.toContain('Judges');
  });
});
