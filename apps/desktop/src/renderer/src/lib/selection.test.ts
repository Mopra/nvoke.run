import { describe, expect, it } from 'vitest';
import { clickSelect, EMPTY_SELECTION, pickSelected } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort();

describe('clickSelect', () => {
  it('selects one row on a plain click', () => {
    const s = clickSelect(clickSelect(EMPTY_SELECTION, order, 'a'), order, 'c');
    expect(ids(s)).toEqual(['c']);
    expect(s.anchor).toBe('c');
  });

  it('toggles with cmd or ctrl', () => {
    let s = clickSelect(EMPTY_SELECTION, order, 'a');
    s = clickSelect(s, order, 'c', { toggle: true });
    expect(ids(s)).toEqual(['a', 'c']);
    s = clickSelect(s, order, 'a', { toggle: true });
    expect(ids(s)).toEqual(['c']);
  });

  it('selects a range from the anchor with shift, both directions', () => {
    let s = clickSelect(EMPTY_SELECTION, order, 'b');
    s = clickSelect(s, order, 'd', { range: true });
    expect(ids(s)).toEqual(['b', 'c', 'd']);
    s = clickSelect(s, order, 'a', { range: true });
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.anchor).toBe('b');
  });

  it('adds the range with cmd and shift', () => {
    let s = clickSelect(EMPTY_SELECTION, order, 'a');
    s = clickSelect(s, order, 'd', { toggle: true });
    s = clickSelect(s, order, 'e', { toggle: true, range: true });
    expect(ids(s)).toEqual(['a', 'd', 'e']);
  });

  it('treats shift without an anchor as a plain click', () => {
    expect(ids(clickSelect(EMPTY_SELECTION, order, 'c', { range: true }))).toEqual(['c']);
  });
});

it('pickSelected keeps list order', () => {
  const items = order.map((id) => ({ id }));
  const s = clickSelect(clickSelect(EMPTY_SELECTION, order, 'd'), order, 'b', { toggle: true });
  expect(pickSelected(items, s).map((i) => i.id)).toEqual(['b', 'd']);
});
