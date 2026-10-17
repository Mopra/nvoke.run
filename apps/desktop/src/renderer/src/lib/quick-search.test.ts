import { describe, expect, it } from 'vitest';
import { parseQuickIcp, parseQuickSearch } from './quick-search';

describe('parseQuickSearch', () => {
  it('reads "niche in place" as a local search', () => {
    expect(parseQuickSearch('dentists in Aarhus')).toEqual({ kind: 'local', params: { niche: 'dentists', location: 'Aarhus' } });
    expect(parseQuickSearch('  yoga   studios near  Lisbon ')).toEqual({
      kind: 'local',
      params: { niche: 'yoga studios', location: 'Lisbon' },
    });
  });

  it('searches the web for anything else', () => {
    expect(parseQuickSearch('vegan bakery')).toEqual({ kind: 'web', params: { keyword: 'vegan bakery' } });
  });

  it('waits for something to search for', () => {
    expect(parseQuickSearch('')).toBeNull();
    expect(parseQuickSearch(' a ')).toBeNull();
  });
});

describe('parseQuickIcp', () => {
  it('offers a description first', () => {
    expect(parseQuickIcp('B2B SaaS startups hiring sales reps')).toEqual({
      input: { kind: 'icp', params: { description: 'B2B SaaS startups hiring sales reps' }, limit: 1000 },
      describes: true,
    });
    expect(parseQuickIcp('agencies that build websites')?.describes).toBe(true);
  });

  it('keeps a keyword a keyword', () => {
    expect(parseQuickIcp('headless cms')?.describes).toBe(false);
    expect(parseQuickIcp('dental clinics aarhus')?.describes).toBe(false);
    expect(parseQuickIcp('agencies with web teams in Berlin')?.describes).toBe(false);
    expect(parseQuickIcp('ab')).toBeNull();
  });
});
