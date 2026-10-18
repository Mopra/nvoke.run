import { describe, expect, it } from 'vitest';
import type { Ai } from '../ai/client.js';
import { DEFAULT_HIRING_ROLES } from './hiring.js';
import {
  PLAN_CAPS,
  barrenTiers,
  keptYields,
  freshCountries,
  hiringQueries,
  makePlan,
  planKey,
  planPrompt,
  planQueries,
  ranKeys,
  replan,
  replanPrompt,
  toPlan,
  toReplan,
  type ClaudePlan,
  type ClaudeReplan,
} from './planner.js';

const raw = (over: Partial<ClaudePlan> = {}): ClaudePlan => ({
  summary: ' Outbound agencies ',
  fit: ['Runs outbound for clients', ' '],
  disqualifiers: ['A job board'],
  countries: ['US', 'uk', 'xx1'],
  core: [
    { q: 'cold email agency', country: 'us' },
    { q: 'Cold  email agency ', country: 'US' },
    { q: 'B2B Leadgenerierung Agentur', country: 'de' },
    { q: 'x', country: null },
  ],
  directories: [{ q: 'top lead generation agencies in London', country: 'gb' }],
  adjacent: [{ q: 'cold email agency', country: 'us' }, { q: 'RevOps consultancy', country: null }],
  wider: [{ q: 'cold email agency', country: 'au' }],
  local: [],
  ...over,
});

describe('toPlan', () => {
  it('trims, deduplicates across tiers and cleans countries', () => {
    const plan = toPlan(raw(), { description: 'Outbound agencies' });
    expect(plan.summary).toBe('Outbound agencies');
    expect(plan.fit).toEqual(['Runs outbound for clients']);
    expect(plan.countries).toEqual(['us', 'gb']);
    expect(plan.core).toEqual([
      { q: 'cold email agency', country: 'us' },
      { q: 'B2B Leadgenerierung Agentur', country: 'de' },
    ]);
    // The same query in a later tier is not run twice.
    expect(plan.adjacent).toEqual([{ q: 'RevOps consultancy' }]);
    expect(plan.wider).toEqual([{ q: 'cold email agency', country: 'au' }]);
    expect(plan.key).toBe(planKey({ description: 'Outbound agencies' }));
  });

  it('keeps the segments, capped, and takes an answer without them', () => {
    const segments = [' Outbound agencies ', 'Small B2B software companies', '', ...Array.from({ length: 8 }, (_, i) => `Segment ${i}`)];
    const plan = toPlan(raw({ segments }), { description: 'Outbound agencies' });
    expect(plan.segments?.slice(0, 2)).toEqual(['Outbound agencies', 'Small B2B software companies']);
    expect(plan.segments).toHaveLength(PLAN_CAPS.segments);
    expect(toPlan(raw(), { description: 'Outbound agencies' }).segments).toEqual([]);
  });

  it('stays inside the countries the user named', () => {
    const plan = toPlan(raw(), { description: 'Outbound agencies', countries: ['us', 'de'] });
    expect(plan.core.map((q) => q.country)).toEqual(['us', 'de']);
    expect(plan.directories).toEqual([]);
    expect(plan.wider).toEqual([]);
    expect(plan.countries).toEqual(['us']);
  });

  it('caps every tier', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ q: `query ${i}`, country: 'us' }));
    const plan = toPlan(raw({ core: many }), { description: 'x y' });
    expect(plan.core).toHaveLength(PLAN_CAPS.core);
  });
});

describe('job post queries', () => {
  it('adds job posts for the roles Sonnet names, every country for one role before the next', () => {
    const plan = toPlan(raw({ hiringRoles: [' Founding Account Executive ', 'founding account executive', 'SDR'] }), { description: 'Founders of B2B companies' });
    expect(plan.hiringRoles).toEqual(['Founding Account Executive', 'SDR']);
    expect(plan.hiring?.map((q) => [q.q.split(' (')[0], q.country])).toEqual([
      ['"Founding Account Executive"', 'us'],
      ['"Founding Account Executive"', 'gb'],
      ['"SDR"', 'us'],
      ['"SDR"', 'gb'],
    ]);
    expect(plan.hiring?.[1]?.q).toContain('site:teamtailor.com');
    expect(planQueries(plan)).toEqual(expect.arrayContaining(plan.hiring!));
    expect(ranKeys(plan)).toEqual(expect.arrayContaining(plan.hiring!.map((q) => `${q.q.toLowerCase()}|${q.country}`)));
  });

  it('falls back to the usual sales roles when the words name sales teams, and adds none otherwise', () => {
    expect(toPlan(raw(), { description: 'Small sales teams doing outbound' }).hiringRoles).toEqual(DEFAULT_HIRING_ROLES);
    const local = toPlan(raw(), { description: 'Dentists in Aarhus' });
    expect(local.hiring).toBeUndefined();
    expect(hiringQueries(['account executive'], ['de'], 5, new Set())).toEqual([
      { q: '"account executive" (site:jobs.personio.de OR site:jobs.personio.com OR site:jobs.ashbyhq.com OR site:job-boards.greenhouse.io OR site:boards.greenhouse.io OR site:recruitee.com OR site:jobs.lever.co)', country: 'de' },
    ]);
  });

  it('caps the job post queries', () => {
    const plan = toPlan(raw({ countries: ['us', 'gb', 'de', 'nl', 'fr', 'es', 'se', 'dk'], hiringRoles: ['a role one', 'a role two', 'a role three'] }), { description: 'Founders' });
    expect(plan.hiring).toHaveLength(PLAN_CAPS.hiring);
  });

  it('searches job posts in the new countries of a fresh round only', () => {
    const params = { description: 'Founders of B2B companies' };
    const first = toPlan(raw({ hiringRoles: ['account executive'] }), params);
    const next = toReplan({ directories: [], adjacent: [], wider: [{ q: 'b2b startup', country: 'nl' }, { q: 'b2b startup', country: 'us' }], local: [] }, params, first, 30)!;
    expect(next.hiring?.map((q) => q.country)).toEqual(['nl']);
    expect(next.hiringRoles).toEqual(['account executive']);
    expect(freshCountries(first, next)).toEqual(['nl']);
  });
});

describe('planKey and planPrompt', () => {
  it('ignores case, spacing and order', () => {
    expect(planKey({ description: 'Dental  Clinics', countries: ['dk', 'se'] })).toBe(planKey({ description: 'dental clinics', countries: ['se', 'dk'] }));
    expect(planKey({ description: 'a b' })).not.toBe(planKey({ description: 'a b', product: 'c' }));
  });

  it('tells the planner to stay inside named countries', () => {
    expect(planPrompt({ description: 'x', countries: ['dk'] })).toContain('Countries to search: DK. Stay inside them.');
    expect(planPrompt({ description: 'x' })).toContain('Pick them.');
  });
});

describe('makePlan', () => {
  it('asks Sonnet once and returns the cleaned plan', async () => {
    const asked: { tier: string; task: string }[] = [];
    const ai: Ai = {
      ready: async () => true,
      structured: async (req) => {
        asked.push({ tier: req.tier, task: req.task });
        return { data: raw() as never, model: 'm', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.02 };
      },
    };
    const { plan, costUsd } = await makePlan(ai, 'user_1', { description: 'Outbound agencies' });
    expect(asked).toEqual([{ tier: 'quality', task: 'plan' }]);
    expect(plan.core.length).toBe(2);
    expect(costUsd).toBe(0.02);
  });
});

describe('replan', () => {
  const params = { description: 'Outbound agencies' };
  const first = toPlan(raw(), params);
  const round = (over: Partial<ClaudeReplan> = {}): ClaudeReplan => ({
    directories: [{ q: 'top lead generation agencies in London', country: 'gb' }, { q: 'best SDR agencies 2026', country: 'us' }],
    adjacent: [{ q: 'Cold email agency', country: 'US' }, { q: 'appointment setting agency', country: 'ca' }],
    wider: [{ q: 'cold email agency', country: 'nl' }, { q: 'outbound agency Sydney', country: 'au' }],
    local: [],
    ...over,
  });

  it('repeats nothing an earlier plan ran and remembers what ran', () => {
    const plan = toReplan(round(), params, first, 30)!;
    // The London list query and the US cold email query ran in the first plan.
    expect(plan.directories).toEqual([{ q: 'best SDR agencies 2026', country: 'us' }]);
    expect(plan.adjacent).toEqual([{ q: 'appointment setting agency', country: 'ca' }]);
    expect(plan.wider).toEqual([{ q: 'cold email agency', country: 'nl' }, { q: 'outbound agency Sydney', country: 'au' }]);
    expect(plan.core).toEqual([]);
    expect(plan.round).toBe(1);
    expect(plan.ran).toEqual(ranKeys(first));
    expect(plan.key).toBe(first.key);
    expect(freshCountries(first, plan)).toEqual(['ca', 'nl']);
    expect(plan.countries).toEqual(expect.arrayContaining(['us', 'gb', 'de', 'au', 'ca', 'nl']));

    // The next round knows both.
    const next = toReplan(round(), params, plan, 30);
    expect(next).toBeNull();
    expect(ranKeys(plan)).toEqual(expect.arrayContaining(['best sdr agencies 2026|us', 'cold email agency|us']));
  });

  it('fits the query budget, taking from every tier in turn', () => {
    const plan = toReplan(round(), params, first, 2)!;
    expect(plan.directories).toHaveLength(1);
    expect(plan.adjacent).toHaveLength(1);
    expect(plan.wider).toHaveLength(0);
  });

  it('stays inside the countries the user named', () => {
    const named = { ...params, countries: ['us', 'au'] };
    const plan = toReplan(round(), named, toPlan(raw(), named), 30)!;
    expect([...plan.directories, ...plan.adjacent, ...plan.wider].map((q) => q.country)).toEqual(['us', 'au']);
  });

  it('keeps new map places even with no web budget, and gives up when nothing is new', () => {
    const local = [{ niche: 'dentist', location: 'Odense' }];
    expect(toReplan(round({ local }), params, first, 0)!.local).toEqual(local);
    expect(toReplan(round({ directories: [], adjacent: [], wider: [] }), params, first, 30)).toBeNull();
  });

  it('tells Sonnet what ran and how the search stands', async () => {
    const prompt = replanPrompt(params, first, { companies: 80, verified: 40, target: 100, maxQueries: 20 });
    expect(prompt).toContain('- cold email agency (US)');
    expect(prompt).toContain('80 fitting companies and 40 verified email addresses, aiming for 100');
    const asked: string[] = [];
    const ai: Ai = {
      ready: async () => true,
      structured: async (req) => {
        asked.push(req.task);
        return { data: round() as never, model: 'm', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.01 };
      },
    };
    const res = await replan(ai, 'user_1', params, first, { companies: 80, verified: 40, target: 100, maxQueries: 20 });
    expect(asked).toEqual(['replan']);
    expect(res.plan?.round).toBe(1);
  });

  it('shows Sonnet the queries that paid off and the ones that kept nothing, and the round size', () => {
    const yields = { 'cold email agency|us': { pages: 2, kept: 9 }, 'b2b leadgenerierung agentur|de': { pages: 1, kept: 0 }, 'never read|us': { pages: 0, kept: 0 } };
    const prompt = replanPrompt(params, { ...first, yields }, { companies: 80, verified: 40, target: 100, maxQueries: 20 });
    expect(prompt).toContain('Searches that found the most fitting companies');
    expect(prompt).toContain('- cold email agency (US): 9 kept');
    expect(prompt).toContain('Searches that found no fitting company (avoid their wording and angle):\n- b2b leadgenerierung agentur (DE)');
    expect(prompt).not.toContain('never read');
    expect(prompt).toContain('This round may run 20 web queries in all');
  });

  it('adds nothing to a tier whose queries read pages and kept nothing, unless every tier did', () => {
    const keys = (qs: { q: string; country?: string }[]) => qs.map((q) => `${q.q.toLowerCase()}|${q.country ?? ''}`);
    const barren = Object.fromEntries(keys(first.directories).map((k) => [k, { pages: 3, kept: 0 }]));
    const kept = Object.fromEntries(keys(first.adjacent).map((k) => [k, { pages: 1, kept: 3 }]));
    const previous = { ...first, yields: { ...barren, ...kept }, rejected: ['bad.com'] };
    expect([...barrenTiers(previous)]).toEqual(['directories']);
    const plan = toReplan(round(), params, previous, 30)!;
    expect(plan.directories).toEqual([]);
    expect(plan.adjacent.length).toBeGreaterThan(0);
    // What the earlier rounds learned goes on to the next one.
    expect(plan.yields).toEqual(keptYields(previous.yields, ranKeys(first)));
    expect(Object.keys(plan.yields!).length).toBeGreaterThan(0);
    expect(plan.rejected).toEqual(['bad.com']);
    // Every tier barren: none is skipped, the replan is all the search has left.
    expect([...barrenTiers({ ...first, yields: barren })]).toEqual([]);
  });
});

describe('keptYields', () => {
  it('keeps only the yields of queries still in the capped ran list', () => {
    expect(keptYields({ 'a|us': { pages: 1, kept: 2 }, 'b|us': { pages: 3, kept: 0 } }, ['a|us'])).toEqual({ 'a|us': { pages: 1, kept: 2 } });
    expect(keptYields(undefined, ['a|us'])).toBeUndefined();
  });
});
