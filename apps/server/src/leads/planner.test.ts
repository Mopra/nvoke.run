import { describe, expect, it } from 'vitest';
import type { Ai } from '../ai/client.js';
import { PLAN_CAPS, makePlan, planKey, planPrompt, toPlan, type ClaudePlan } from './planner.js';

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
