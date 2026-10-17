import { describe, expect, it } from 'vitest';
import { searchPath, stillOpening } from './navigation';

describe('opening a new search', () => {
  it('points at the search page', () => {
    expect(searchPath('5bd5a041-aaf5-4dab-9606-4c9e57be1227')).toBe('/app/searches/5bd5a041-aaf5-4dab-9606-4c9e57be1227');
  });

  it('takes over only while the old page is still up', () => {
    const target = searchPath('abc');
    expect(stillOpening('/app/new', target)).toBe(true);
    expect(stillOpening('/app/website', target)).toBe(true);
    expect(stillOpening(target, target)).toBe(false);
    expect(stillOpening(`${target}/`, target)).toBe(false);
  });
});
