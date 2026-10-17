import { describe, expect, it } from 'vitest';
import type { SiteProfileFields } from '@nvoke/shared';
import { ApiError } from './api';
import {
  BUILD_PHASES,
  buildPhase,
  buildProblem,
  displayDomain,
  profileForm,
  profilePatch,
  readWebsite,
  suggestionCaption,
  suggestionTitle,
} from './site-profile';

describe('readWebsite', () => {
  it('takes a bare domain as is', () => {
    expect(readWebsite(' Acme.dk ')).toEqual({ ok: true, website: 'acme.dk', domain: 'acme.dk' });
  });

  it('drops the scheme, www and a trailing slash from the shown domain', () => {
    expect(readWebsite('https://www.acme.dk/')).toEqual({ ok: true, website: 'www.acme.dk', domain: 'acme.dk' });
  });

  it('keeps a page when the URL names one', () => {
    expect(readWebsite('acme.dk/en/services?x=1')).toEqual({
      ok: true,
      website: 'https://acme.dk/en/services?x=1',
      domain: 'acme.dk',
    });
  });

  it('reads an email address as its domain', () => {
    expect(readWebsite('mia@acme.dk')).toEqual({ ok: true, website: 'acme.dk', domain: 'acme.dk' });
  });

  it('refuses what is not a public website', () => {
    for (const bad of ['', '   ', 'acme', 'acme dk', 'localhost:3000', '192.168.1.10', 'ftp://acme.dk', 'acme.d4']) {
      expect(readWebsite(bad).ok, bad).toBe(false);
    }
  });

  it('says why in one line', () => {
    expect(readWebsite('')).toEqual({ ok: false, problem: 'Type your website first.' });
    expect(readWebsite('10.0.0.1')).toMatchObject({ problem: expect.stringMatching(/IP address/) });
  });
});

describe('displayDomain', () => {
  it('shows a stored website as its domain', () => {
    expect(displayDomain('https://www.acme.dk/')).toBe('acme.dk');
  });
});

describe('buildPhase', () => {
  it('walks the phases in order and stays on the last', () => {
    expect(buildPhase(0)).toBe(0);
    expect(buildPhase(5_000)).toBe(1);
    expect(buildPhase(16_999)).toBe(2);
    expect(buildPhase(120_000)).toBe(BUILD_PHASES.length - 1);
  });

  it('names the site first', () => {
    expect(BUILD_PHASES[0]?.label('acme.dk')).toBe('Reading acme.dk');
  });
});

describe('buildProblem', () => {
  const unreadable = (detail: string) => new ApiError(422, 'site_unreadable', null, detail);

  it('names the site for each reason it could not be read', () => {
    expect(buildProblem(unreadable('blocked'), 'acme.dk')).toBe('robots.txt keeps us out of acme.dk.');
    expect(buildProblem(unreadable('unreachable'), 'acme.dk')).toMatch(/^acme\.dk didn’t answer/);
    expect(buildProblem(unreadable('refused'), 'acme.dk')).toBe('acme.dk turns our servers away.');
    expect(buildProblem(unreadable('js_only'), 'acme.dk')).toMatch(/JavaScript/);
    expect(buildProblem(unreadable('empty'), 'acme.dk')).toMatch(/too little text/);
    expect(buildProblem(unreadable('not_allowed'), 'acme.dk')).toMatch(/private or local/);
    expect(buildProblem(unreadable('something_new'), 'acme.dk')).toBe('We couldn’t read acme.dk.');
  });

  it('explains the daily limit and Claude being away', () => {
    expect(buildProblem(new ApiError(429, 'rate_limited'), 'acme.dk')).toMatch(/10 sites read today/);
    expect(buildProblem(new ApiError(503, 'ai_unavailable'), 'acme.dk')).toMatch(/Claude isn’t answering/);
  });

  it('falls back to the plain API message', () => {
    expect(buildProblem(new ApiError(0, 'network'), 'acme.dk')).toMatch(/Can’t reach nvoke/);
    expect(buildProblem(new Error('boom'), 'acme.dk')).toMatch(/Try again/);
  });
});

describe('suggestions', () => {
  it('titles a suggestion like the searches list', () => {
    expect(suggestionTitle({ kind: 'local', params: { niche: 'dental clinics', location: 'Aarhus' }, limit: 50 })).toBe(
      'Dental clinics in Aarhus',
    );
    expect(suggestionTitle({ kind: 'web', params: { keyword: 'dental software', country: 'dk' } })).toBe('"dental software" in DK');
    expect(suggestionTitle({ kind: 'launches', params: {} })).toBe('All launches, last 7 days');
  });

  it('says the kind and how many', () => {
    expect(suggestionCaption({ kind: 'local', params: { niche: 'a', location: 'b' }, limit: 50 })).toBe(
      'Local businesses, up to 50 companies',
    );
    expect(suggestionCaption({ kind: 'web', params: { keyword: 'a' } })).toBe('Web search');
    expect(suggestionCaption({ kind: 'domains', params: { items: ['a.dk', 'b.dk'] } })).toBe('Named companies, 2 companies');
  });
});

describe('profile edit', () => {
  const current: SiteProfileFields = {
    name: 'Acme',
    summary: 'Booking software for dental clinics.',
    offer: 'Online booking and reminders',
    audience: 'Dental clinics in Denmark',
    proofPoints: ['400 clinics', 'Since 2015'],
    voice: ['simple', 'no setup'],
    language: 'da',
    country: 'dk',
  };

  it('turns lists into text and back without changes', () => {
    const form = profileForm(current);
    expect(form.proofPoints).toBe('400 clinics\nSince 2015');
    expect(form.voice).toBe('simple, no setup');
    expect(form.country).toBe('DK');
    expect(profilePatch(form, current)).toEqual({ ok: true, patch: null });
  });

  it('sends only what changed', () => {
    const form = { ...profileForm(current), audience: 'Dental clinics in the Nordics', proofPoints: '- 400 clinics\n\n• Since 2015\n4.8 on Trustpilot' };
    expect(profilePatch(form, current)).toEqual({
      ok: true,
      patch: { audience: 'Dental clinics in the Nordics', proofPoints: ['400 clinics', 'Since 2015', '4.8 on Trustpilot'] },
    });
  });

  it('clears the country and lowercases the language', () => {
    const form = { ...profileForm(current), country: '', language: 'EN' };
    expect(profilePatch(form, current)).toEqual({ ok: true, patch: { country: null, language: 'en' } });
  });

  it('names the field the server would refuse', () => {
    expect(profilePatch({ ...profileForm(current), name: '  ' }, current)).toEqual({ ok: false, problem: 'Name: 1 to 120 characters.' });
    expect(profilePatch({ ...profileForm(current), language: 'dan' }, current)).toMatchObject({ problem: expect.stringMatching(/two letters/) });
  });
});
