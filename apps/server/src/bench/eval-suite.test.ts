import { describe, expect, it } from 'vitest';
import { emailPrompt, icpPrompt } from './eval-judge.js';
import { EVAL_SUITE, entryRequests, pickEntries } from './eval-suite.js';

describe('EVAL_SUITE', () => {
  it('has nine entries with unique ids and an intent each', () => {
    expect(EVAL_SUITE).toHaveLength(9);
    expect(new Set(EVAL_SUITE.map((e) => e.id)).size).toBe(9);
    for (const e of EVAL_SUITE) expect(e.intent.length).toBeGreaterThan(20);
  });

  it('holds only searches the API accepts', () => {
    for (const e of EVAL_SUITE) expect(() => entryRequests(e)).not.toThrow();
    expect(entryRequests(EVAL_SUITE.find((e) => e.id === 'nvoke-customers')!)).toHaveLength(4);
    const [launches] = entryRequests(EVAL_SUITE.find((e) => e.id === 'launches')!);
    expect(launches).toMatchObject({ kind: 'launches', params: { days: 7 }, limit: 100 });
  });
});

describe('pickEntries', () => {
  it('picks by id and refuses unknown ids', () => {
    expect(pickEntries(undefined)).toHaveLength(9);
    expect(pickEntries(['dentists-aarhus']).map((e) => e.id)).toEqual(['dentists-aarhus']);
    expect(() => pickEntries(['nope'])).toThrow(/unknown eval entries: nope/);
  });
});

describe('judge prompts', () => {
  it('numbers companies and addresses from 1', () => {
    const icp = icpPrompt('dentists', [
      { id: 'a', name: 'Smile', domain: 'smile.dk', website: 'https://smile.dk', category: 'dentist', location: 'Aarhus', title: 'Smile\nclinic', description: '' },
    ]);
    expect(icp).toContain('1. Smile (smile.dk); category: dentist; location: Aarhus; homepage title: Smile clinic');
    const mail = emailPrompt('dentists', [
      { id: 'e', address: 'info@smile.dk', kind: 'generic', name: null, title: null, company: 'Smile', domain: 'smile.dk', verification: null },
    ]);
    expect(mail).toContain('1. info@smile.dk; kind: generic; company: Smile (smile.dk); verification: not checked');
  });
});
