import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router';

describe('search route', () => {
  it('carries an optional text filter', () => {
    const route = { name: 'search', id: 'abc', q: 'smile.dk' } as const;
    expect(routeHref(route)).toBe('#/searches/abc?q=smile.dk');
    expect(parseRoute(routeHref(route))).toEqual(route);
    expect(parseRoute('#/searches/abc')).toEqual({ name: 'search', id: 'abc' });
    expect(routeHref({ name: 'search', id: 'abc' })).toBe('#/searches/abc');
  });
});
