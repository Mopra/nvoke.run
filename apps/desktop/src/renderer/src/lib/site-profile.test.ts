import { describe, expect, it } from 'vitest';
import type { SiteProfileFields } from '@nvoke/shared';
import { buildPhase, draftToUpdate, parseWebsite, profileToDraft, siteProfileErrorLine, suggestionCaption } from './site-profile';

const PROFILE: SiteProfileFields = {
  name: 'Acme',
  summary: 'Acme builds booking sites for clinics.',
  offer: 'Websites with online booking.',
  audience: 'Dental clinics in Denmark.',
  proofPoints: ['40 clinics live', 'Webflow partner'],
  voice: ['calm', 'no lock-in'],
  language: 'da',
  country: 'dk',
};

describe('parseWebsite', () => {
  it('takes a bare domain, a URL and a path', () => {
    expect(parseWebsite('acme.dk')).toEqual({ website: 'acme.dk', domain: 'acme.dk' });
    expect(parseWebsite('  https://www.Acme.dk/about ')).toEqual({ website: 'https://www.Acme.dk/about', domain: 'acme.dk' });
    expect(parseWebsite('http://shop.acme.co.uk')).toEqual({ website: 'http://shop.acme.co.uk', domain: 'shop.acme.co.uk' });
  });

  it('refuses what is not a public host', () => {
    for (const bad of ['', 'acme', 'localhost', 'acme dk', '192.168.1.10', 'ftp://acme.dk', 'mailto:me@acme.dk', 'https://user:pw@acme.dk', '-acme.dk']) {
      expect(parseWebsite(bad), bad).toBeNull();
    }
  });
});

describe('buildPhase', () => {
  it('walks the phases by elapsed time', () => {
    expect(buildPhase(0, 'acme.dk')).toBe('Reading acme.dk');
    expect(buildPhase(-50, 'acme.dk')).toBe('Reading acme.dk');
    expect(buildPhase(7000, 'acme.dk')).toMatch(/about, pricing/);
    expect(buildPhase(15_000, 'acme.dk')).toBe('Working out who buys from you');
    expect(buildPhase(21_000, 'acme.dk')).toBe('Planning searches that find them');
    expect(buildPhase(90_000, 'acme.dk')).toMatch(/^Still planning/);
  });
});

describe('siteProfileErrorLine', () => {
  it('says what went wrong per reason', () => {
    expect(siteProfileErrorLine(422, 'site_unreadable', 'blocked', 'acme.dk')).toBe('robots.txt keeps us out of acme.dk.');
    expect(siteProfileErrorLine(422, 'site_unreadable', 'js_only', 'acme.dk')).toMatch(/needs JavaScript/);
    expect(siteProfileErrorLine(422, 'site_unreadable', 'unreachable', 'acme.dk')).toMatch(/^acme\.dk did not answer/);
    expect(siteProfileErrorLine(422, 'site_unreadable', 'not_allowed', 'acme.dk')).toMatch(/private or local/);
    expect(siteProfileErrorLine(422, 'site_unreadable', null, '')).toBe('We could not read that site.');
    expect(siteProfileErrorLine(429, 'rate_limited', null, 'acme.dk')).toMatch(/10 reads today/);
    expect(siteProfileErrorLine(503, 'ai_unavailable', null, 'acme.dk')).toMatch(/Claude/);
    expect(siteProfileErrorLine(0, 'network', null, 'acme.dk')).toMatch(/connection/);
  });
});

describe('suggestionCaption', () => {
  it('names the kind and the size', () => {
    expect(suggestionCaption({ kind: 'local', params: { niche: 'dentists', location: 'Aarhus' }, limit: 100 })).toBe(
      'Local businesses, up to 100 companies',
    );
    expect(suggestionCaption({ kind: 'domains', params: { items: ['a.dk', 'b.dk'] } })).toBe('Your list, 2 companies');
  });
});

describe('profile draft', () => {
  it('round trips with no changes', () => {
    expect(draftToUpdate(profileToDraft(PROFILE), PROFILE)).toEqual({ ok: true, update: null });
  });

  it('returns only the changed fields, lists split and trimmed', () => {
    const draft = { ...profileToDraft(PROFILE), proofPoints: ' 41 clinics live \n\nWebflow partner\n', voice: 'calm,  direct ,', country: '' };
    expect(draftToUpdate(draft, PROFILE)).toEqual({
      ok: true,
      update: { proofPoints: ['41 clinics live', 'Webflow partner'], voice: ['calm', 'direct'], country: null },
    });
  });

  it('refuses empty fields and a bad language', () => {
    expect(draftToUpdate({ ...profileToDraft(PROFILE), audience: '  ' }, PROFILE)).toMatchObject({ ok: false, field: 'audience' });
    expect(draftToUpdate({ ...profileToDraft(PROFILE), language: 'dan' }, PROFILE)).toMatchObject({ ok: false, field: 'language' });
    expect(draftToUpdate({ ...profileToDraft(PROFILE), language: 'EN' }, PROFILE)).toEqual({ ok: true, update: { language: 'en' } });
  });
});
