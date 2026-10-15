import { describe, expect, it } from 'vitest';
import { CreateSearchRequest } from '@nvoke/shared';
import { buildSearchInput, clampLimit, emptyForm, formProblem, isFormKind, summarizeList, type SearchForm } from './search-form';

const form = (patch: Partial<SearchForm>): SearchForm => ({ ...emptyForm(patch.kind), ...patch });

describe('buildSearchInput', () => {
  it('builds a local search from a niche and a place', () => {
    const input = buildSearchInput(form({ kind: 'local', niche: ' dentists ', location: 'Austin ', limit: 25 }));
    expect(input).toEqual({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 25 });
    expect(CreateSearchRequest.safeParse(input).success).toBe(true);
  });

  it('needs both words of a local search', () => {
    expect(buildSearchInput(form({ kind: 'local', niche: 'dentists' }))).toBeNull();
    expect(buildSearchInput(form({ kind: 'local', location: 'Austin' }))).toBeNull();
  });

  it('leaves the country out of a web search unless picked', () => {
    expect(buildSearchInput(form({ kind: 'web', keyword: 'headless cms' }))).toEqual({
      kind: 'web',
      params: { keyword: 'headless cms' },
      limit: 100,
    });
    const withCountry = buildSearchInput(form({ kind: 'web', keyword: 'roofing', country: 'US' }));
    expect(withCountry).toEqual({ kind: 'web', params: { keyword: 'roofing', country: 'US' }, limit: 100 });
    expect(CreateSearchRequest.safeParse(withCountry).success).toBe(true);
  });

  it('sends launches with the window in days and an optional keyword', () => {
    expect(buildSearchInput(form({ kind: 'launches', launchWindow: 'day' }))).toEqual({
      kind: 'launches',
      params: { days: 1 },
      limit: 100,
    });
    const input = buildSearchInput(form({ kind: 'launches', launchKeyword: 'ai', launchWindow: 'month' }));
    expect(input).toEqual({ kind: 'launches', params: { days: 30, keyword: 'ai' }, limit: 100 });
    expect(CreateSearchRequest.safeParse(input).success).toBe(true);
  });

  it('sends a pasted list as items, with no limit, and a country only for names', () => {
    const domains = buildSearchInput(form({ kind: 'domains', list: 'linear.app\nhttps://pleo.io/en\n', listCountry: 'DK' }));
    expect(domains).toEqual({ kind: 'domains', params: { items: ['linear.app', 'https://pleo.io/en'] } });
    const names = buildSearchInput(form({ kind: 'domains', list: 'Novo Nordisk\nlinear.app', listCountry: 'DK' }));
    expect(names).toEqual({ kind: 'domains', params: { items: ['Novo Nordisk', 'linear.app'], country: 'DK' } });
    expect(CreateSearchRequest.safeParse(names).success).toBe(true);
  });

  it('refuses an empty list and one longer than the plan allows', () => {
    expect(buildSearchInput(form({ kind: 'domains', list: '  \n ' }))).toBeNull();
    expect(buildSearchInput(form({ kind: 'domains', list: 'a.com\nb.com\nc.com' }), 2)).toBeNull();
    expect(buildSearchInput(form({ kind: 'domains', list: 'a.com\nb.com' }), 2)).not.toBeNull();
  });

  it('caps the limit at the plan maximum', () => {
    const input = buildSearchInput(form({ kind: 'web', keyword: 'x', limit: 5000 }), 1000);
    expect(input?.limit).toBe(1000);
  });
});

describe('clampLimit', () => {
  it('falls back to 100 for an empty or silly field', () => {
    expect(clampLimit(Number.NaN)).toBe(100);
    expect(clampLimit(0)).toBe(100);
    expect(clampLimit(-4)).toBe(100);
    expect(clampLimit(12.6)).toBe(13);
    expect(clampLimit(Number.NaN, 50)).toBe(50);
  });
});

describe('summarizeList', () => {
  it('counts domains against names to look up', () => {
    expect(summarizeList('acme.com\nhello@raycast.com\nNovo Nordisk', 10)).toEqual({
      items: ['acme.com', 'hello@raycast.com', 'Novo Nordisk'],
      tooLong: false,
      domains: 2,
      names: 1,
    });
  });

  it('notices a list one past the maximum', () => {
    expect(summarizeList('a.com\nb.com\nc.com', 2).tooLong).toBe(true);
  });
});

describe('formProblem', () => {
  it('says why the form will not start', () => {
    expect(formProblem(form({ kind: 'local' }))).toBe('Fill in the highlighted words.');
    expect(formProblem(form({ kind: 'domains' }))).toBe('Paste a domain or a company name per line.');
    expect(formProblem(form({ kind: 'domains', list: 'a.com\nb.com' }), 1)).toBe('Up to 1 companies in one list.');
    expect(formProblem(form({ kind: 'launches' }))).toBeNull();
  });
});

describe('isFormKind', () => {
  it('accepts the four kinds a person can start, not drops', () => {
    expect(['local', 'web', 'launches', 'domains'].every(isFormKind)).toBe(true);
    expect(isFormKind('drop')).toBe(false);
    expect(isFormKind(undefined)).toBe(false);
    expect(isFormKind(['web'])).toBe(false);
  });
});
