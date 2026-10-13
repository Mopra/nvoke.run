import { describe, expect, it } from 'vitest';
import { buildQuery } from './api';
import { companiesToCsv } from './csv';
import { csvFileName, percent, relativeTime, searchTitle } from './format';
import { parseRoute, routeHref } from './router';
import type { Company, Search } from './types';

const base = {
  id: 's1',
  limit: 100,
  status: 'done',
  error: null,
  companiesFound: 0,
  companiesCrawled: 0,
  emailsFound: 0,
  emailsValid: 0,
  createdAt: '2026-10-13T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
} as const;

describe('format', () => {
  it('titles each kind of search', () => {
    expect(searchTitle({ ...base, kind: 'local', params: { niche: 'dentists', location: 'austin' } })).toBe(
      'Dentists in Austin',
    );
    expect(searchTitle({ ...base, kind: 'web', params: { keyword: 'cms', country: 'de' } })).toBe('"cms" in DE');
    expect(searchTitle({ ...base, kind: 'launches', params: { days: 7 } })).toBe('All launches, last 7 days');
    expect(searchTitle({ ...base, kind: 'domains', params: { items: ['acme.com'] } })).toBe('acme.com');
    expect(searchTitle({ ...base, kind: 'domains', params: { items: ['acme.com', 'Pleo'] } })).toBe('acme.com and Pleo');
    expect(searchTitle({ ...base, kind: 'domains', params: { items: ['acme.com', 'Pleo', 'a.dk', 'b.dk'] } })).toBe(
      'acme.com, Pleo and 2 more',
    );
  });

  it('builds safe csv file names', () => {
    const s: Search = { ...base, kind: 'local', params: { niche: 'Bakeries', location: 'Århus C' } };
    expect(csvFileName(s)).toBe('nvoke-bakeries-in-arhus-c.csv');
  });

  it('clamps percentages', () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(150, 100)).toBe(100);
    expect(percent(25, 100)).toBe(25);
  });

  it('describes relative times', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(relativeTime('2026-10-13T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-10-13T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-10-12T12:00:00Z', now)).toBe('yesterday');
  });
});

describe('csv', () => {
  it('writes one row per email and escapes cells', () => {
    const company: Company = {
      id: 'c1',
      name: 'Smith, Jones & "Co"',
      domain: 'sj.com',
      website: 'https://sj.com',
      source: 'osm',
      sourceRef: null,
      location: null,
      phone: null,
      category: null,
      crawlStatus: 'done',
      crawledAt: null,
      localCrawl: null,
      emails: [
        { id: 'e1', address: 'info@sj.com', kind: 'generic', sourceUrl: null, verification: 'valid', checkedAt: null },
        { id: 'e2', address: 'anna@sj.com', kind: 'personal', sourceUrl: null, verification: 'risky', checkedAt: null },
      ],
    };
    const lines = companiesToCsv([company]).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('company,domain,website,email,kind,verification,source_url,location,phone');
    expect(lines[1]).toBe('"Smith, Jones & ""Co""",sj.com,https://sj.com,info@sj.com,generic,valid,,,');
  });
});

describe('router and query', () => {
  it('round trips routes', () => {
    for (const route of [
      { name: 'searches' },
      { name: 'new', kind: 'web' },
      { name: 'search', id: 'a b' },
      { name: 'account' },
    ] as const) {
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
    expect(parseRoute('#/new')).toEqual({ name: 'new', kind: null });
    expect(parseRoute('#/nowhere')).toEqual({ name: 'searches' });
  });

  it('skips empty query params', () => {
    expect(buildQuery({ q: '', kind: 'personal', cursor: undefined })).toBe('?kind=personal');
    expect(buildQuery({})).toBe('');
  });
});
