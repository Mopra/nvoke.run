import { describe, expect, it } from 'vitest';
import { parseQuickSearch } from './quick-search';

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
