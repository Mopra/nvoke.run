import { describe, expect, it } from 'vitest';
import { COMPETITORS, nvokeQuote, quote } from './vs';

describe('vs quotes', () => {
  it('picks the cheapest plan that covers the credits', () => {
    expect(quote(COMPETITORS.hunter, 1_000, 'monthly')).toEqual({ plan: 'Starter', seats: 1, price: 49 });
    expect(quote(COMPETITORS.snov, 1_000, 'monthly')).toEqual({ plan: 'Pro S', seats: 1, price: 99 });
  });
  it('uses the free plan when it covers the need', () => {
    expect(quote(COMPETITORS.hunter, 40, 'annual')?.price).toBe(0);
  });
  it('adds Apollo seats, honouring the Organization minimum', () => {
    expect(quote(COMPETITORS.apollo, 5_000, 'annual')).toEqual({ plan: 'Basic', seats: 2, price: 98 });
  });
  it('returns null above the published plans', () => {
    expect(quote(COMPETITORS.hunter, 100_000, 'monthly')).toBeNull();
    expect(nvokeQuote(200_000)).toBeNull();
  });
  it('quotes nvoke from the shared ladder', () => {
    expect(nvokeQuote(2_000)).toEqual({ plan: '2,500 a month', price: 19 });
  });
});
