import { describe, expect, it } from 'vitest';
import { isPlatformDomain, normalizeDomain, normalizeWebsite, registrableDomain, sameSite } from './domain.js';

describe('normalizeDomain', () => {
  it.each([
    ['https://www.Acme.dk/kontakt?x=1#top', 'acme.dk'],
    ['http://acme.dk:8080', 'acme.dk'],
    ['acme.dk', 'acme.dk'],
    ['www.acme.dk/', 'acme.dk'],
    ['//acme.dk/path', 'acme.dk'],
    ['HTTPS://SHOP.ACME.DK.', 'shop.acme.dk'],
    ['https://user:pw@acme.dk', 'acme.dk'],
    ['https://www.tandlæge-hellerup.dk/', 'xn--tandlge-hellerup-yob.dk'],
    ['https://acme.co.uk', 'acme.co.uk'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(['', '   ', 'not a url', 'ftp://acme.dk', 'mailto:info@acme.dk', 'http://localhost:3000', 'http://192.168.1.1', 'http://[::1]/', 'https://intranet', 'https://printer.local', 'https://acme.123'])(
    'rejects %j',
    (input) => {
      expect(normalizeDomain(input)).toBeNull();
    },
  );

  it('collapses the variants of one site to one key (dedupe)', () => {
    const variants = ['https://acme.dk', 'http://www.acme.dk/', 'acme.dk/om-os', 'https://WWW.ACME.DK/?utm_source=x'];
    expect(new Set(variants.map(normalizeDomain))).toEqual(new Set(['acme.dk']));
  });
});

describe('normalizeWebsite', () => {
  it('adds https to bare hosts and drops fragments and credentials', () => {
    expect(normalizeWebsite('acme.dk')).toBe('https://acme.dk/');
    expect(normalizeWebsite('http://u:p@acme.dk/x#y')).toBe('http://acme.dk/x');
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull();
  });
});

describe('registrableDomain and sameSite', () => {
  it('strips subdomains, aware of second level country domains', () => {
    expect(registrableDomain('mail.shop.acme.dk')).toBe('acme.dk');
    expect(registrableDomain('www.acme.co.uk')).toBe('acme.co.uk');
    expect(registrableDomain('shop.acme.com.au')).toBe('acme.com.au');
    expect(registrableDomain('co.example.com')).toBe('example.com');
    expect(sameSite('mail.acme.dk', 'acme.dk')).toBe(true);
    expect(sameSite('acme.dk', 'acme.se')).toBe(false);
  });
});

describe('isPlatformDomain', () => {
  it.each(['facebook.com', 'm.facebook.com', 'instagram.com', 'linkedin.com', 'de.wikipedia.org', 'en.m.wikipedia.org', 'google.dk', 'amazon.de', 'yelp.com', 'trustpilot.com', 'krak.dk', 'github.com', 'foo.github.io', 'fusebox.sifatsrk.workers.dev', 'bbc.co.uk', 'nytimes.com', 'linktr.ee'])(
    '%s is a platform',
    (d) => {
      expect(isPlatformDomain(d)).toBe(true);
    },
  );

  it.each(['acme.dk', 'tandtorvet.dk', 'notfacebook.com', 'facebook.com.acme.dk', 'googlefan.dk'])('%s is not a platform', (d) => {
    expect(isPlatformDomain(d)).toBe(false);
  });
});
