import { describe, expect, it } from 'vitest';
import { isBlockedCountry, isBlockedRecipient, recipientCountry, timezoneFor } from './gate.js';

const country = (location: string | null, domain = 'example.com') => recipientCountry({ location, domain });

describe('recipientCountry', () => {
  it('reads a country named last', () => {
    expect(country('Aarhus, Denmark')).toBe('DK');
    expect(country('Musterstraße 4, 10115 Berlin, Deutschland')).toBe('DE');
    expect(country('Leeds, United Kingdom')).toBe('GB');
    expect(country('Leeds, England')).toBe('GB');
    expect(country('Lyon, France')).toBe('FR');
    expect(country('Austin, Texas, USA')).toBe('US');
    expect(country('Utrecht, The Netherlands')).toBe('NL');
    expect(country('Malmö, Sverige')).toBe('SE');
    expect(country('Wien, Österreich')).toBe('AT');
    expect(country('Praha, Czechia')).toBe('CZ');
  });

  it('reads cities named alone, accents or not', () => {
    expect(country('Vej 2, 2100 København')).toBe('DK');
    expect(country('Kobenhavn K')).toBe('DK');
    expect(country('Hellerup')).toBe('DK');
    expect(country('Köln')).toBe('DE');
    expect(country('München')).toBe('DE');
    expect(country('Torstraße 1, Berlin')).toBe('DE');
    expect(country('London')).toBe('GB');
    expect(country('Remote, based in Stockholm')).toBe('SE');
  });

  it('reads a state or province code after a city', () => {
    expect(country('Austin, TX')).toBe('US');
    expect(country('San Francisco, CA')).toBe('US');
    expect(country('Toronto, ON')).toBe('CA');
    expect(country('Toronto, CA')).toBe('CA');
    expect(country('Paris, TX')).toBe('US');
    expect(country('Wilmington, DE')).toBe('US');
    expect(country('100 Main St, Austin TX 78701')).toBe('US');
    expect(country('Ottawa ON K1P 1J1')).toBe('CA');
    expect(country('Level 3, 1 Martin Place, Sydney NSW 2000')).toBe('AU');
    expect(country('Portland, Oregon')).toBe('US');
    expect(country('Atlanta, Georgia')).toBe('US');
    expect(country('Albuquerque, New Mexico')).toBe('US');
    expect(country('Newark, New Jersey')).toBe('US');
  });

  it('reads a country code after a city it knows', () => {
    expect(country('Berlin, DE')).toBe('DE');
    expect(country('Hamburg, DE')).toBe('DE');
    expect(country('Leeds, UK')).toBe('GB');
    expect(country('Odense, DK')).toBe('DK');
    expect(country('DK')).toBe('DK');
  });

  it('lets a matching domain decide an ambiguous code', () => {
    expect(country('Kleinstadt, DE', 'firma.de')).toBe('DE');
    expect(country('Smalltown, DE', 'shop.com')).toBe('US');
  });

  it('does not read a country inside a longer word or a US state', () => {
    expect(country('Indianapolis, Indiana')).toBe('US');
    expect(country('Sydney, New South Wales')).toBe('AU');
  });

  it('falls back to a country code domain', () => {
    expect(country(null, 'tandlaege.dk')).toBe('DK');
    expect(country(null, 'firma.de')).toBe('DE');
    expect(country(null, 'shop.co.uk')).toBe('GB');
    expect(country(null, 'agency.com.au')).toBe('AU');
    expect(country('', 'studio.fr')).toBe('FR');
    expect(country('Somewhere unknown', 'studio.se')).toBe('SE');
    expect(country(null, 'FIRMA.DE.')).toBe('DE');
  });

  it('gives null for generic domains and unknown places', () => {
    expect(country(null, 'acme.com')).toBeNull();
    expect(country(null, 'startup.io')).toBeNull();
    expect(country(null, 'lab.ai')).toBeNull();
    expect(country(null, 'brand.co')).toBeNull();
    expect(country(null, 'site.eu')).toBeNull();
    expect(country('Remote', 'acme.com')).toBeNull();
  });

  it('prefers the location over the domain', () => {
    expect(country('Berlin, Germany', 'startup.io')).toBe('DE');
    expect(country('Austin, TX', 'agency.dk')).toBe('US');
  });
});

describe('isBlockedCountry', () => {
  it('blocks Denmark and Germany only', () => {
    expect(isBlockedCountry('DK')).toBe(true);
    expect(isBlockedCountry('DE')).toBe(true);
    expect(isBlockedCountry('de')).toBe(true);
    expect(isBlockedCountry('SE')).toBe(false);
    expect(isBlockedCountry('US')).toBe(false);
    expect(isBlockedCountry(null)).toBe(false);
  });

  it('blocks what the gate reads from a Danish or German lead', () => {
    expect(isBlockedCountry(country('Vej 2, 2100 København', 'klinik.com'))).toBe(true);
    expect(isBlockedCountry(country(null, 'firma.de'))).toBe(true);
    expect(isBlockedCountry(country('Austin, TX', 'shop.com'))).toBe(false);
  });
});

describe('isBlockedRecipient', () => {
  const blocked = (location: string | null, domain: string, address: string) => isBlockedRecipient({ location, domain, address });

  it('blocks when any signal says a blocked country, whatever the others say', () => {
    // The location says GB (and keeps the timezone), the domain still says DK.
    expect(country('London, UK', 'klinik.dk')).toBe('GB');
    expect(blocked('London, UK', 'klinik.dk', 'anna@klinik.dk')).toBe(true);
    // The address's own domain is German on a .com company.
    expect(blocked('Austin, TX', 'shop.com', 'ole@shop.de')).toBe(true);
    expect(blocked(null, 'shop.com', 'ole@x.de')).toBe(true);
    // The location alone.
    expect(blocked('Aarhus, Denmark', 'shop.com', 'ole@shop.com')).toBe(true);
    expect(blocked('Berlin', 'shop.co.uk', 'ole@shop.co.uk')).toBe(true);
  });

  it('lets a recipient through when no signal is blocked', () => {
    expect(blocked('London, UK', 'shop.co.uk', 'anna@shop.co.uk')).toBe(false);
    expect(blocked(null, 'shop.io', 'anna@gmail.com')).toBe(false);
    expect(blocked('Austin, TX', 'shop.com', 'not-an-address')).toBe(false);
  });
});

describe('timezoneFor', () => {
  it('gives the main zone of a country', () => {
    expect(timezoneFor('GB')).toBe('Europe/London');
    expect(timezoneFor('SE')).toBe('Europe/Stockholm');
    expect(timezoneFor('IN')).toBe('Asia/Kolkata');
    expect(timezoneFor('JP')).toBe('Asia/Tokyo');
    expect(timezoneFor('BR')).toBe('America/Sao_Paulo');
    expect(timezoneFor('nz')).toBe('Pacific/Auckland');
    expect(timezoneFor('US')).toBe('America/New_York');
    expect(timezoneFor('CA')).toBe('America/Toronto');
    expect(timezoneFor('AU')).toBe('Australia/Sydney');
  });

  it('refines the United States by state and city', () => {
    expect(timezoneFor('US', 'Austin, TX')).toBe('America/Chicago');
    expect(timezoneFor('US', 'San Francisco, CA')).toBe('America/Los_Angeles');
    expect(timezoneFor('US', 'SAN FRANCISCO CA 94103')).toBe('America/Los_Angeles');
    expect(timezoneFor('US', 'Denver, Colorado')).toBe('America/Denver');
    expect(timezoneFor('US', 'Phoenix')).toBe('America/Phoenix');
    expect(timezoneFor('US', 'Seattle')).toBe('America/Los_Angeles');
    expect(timezoneFor('US', 'Honolulu, HI')).toBe('Pacific/Honolulu');
    expect(timezoneFor('US', 'Brooklyn, NY')).toBe('America/New_York');
    expect(timezoneFor('US', 'Somewhere')).toBe('America/New_York');
  });

  it('refines Canada and Australia', () => {
    expect(timezoneFor('CA', 'Vancouver, BC')).toBe('America/Vancouver');
    expect(timezoneFor('CA', 'Calgary')).toBe('America/Edmonton');
    expect(timezoneFor('CA', 'Halifax, Nova Scotia')).toBe('America/Halifax');
    expect(timezoneFor('AU', 'Perth WA 6000')).toBe('Australia/Perth');
    expect(timezoneFor('AU', 'Brisbane, Queensland')).toBe('Australia/Brisbane');
    expect(timezoneFor('AU', 'Melbourne')).toBe('Australia/Melbourne');
  });

  it('does not refine other countries by US words', () => {
    expect(timezoneFor('GB', 'Leeds, WA')).toBe('Europe/London');
  });

  it('gives UTC for an unknown country', () => {
    expect(timezoneFor(null)).toBe('UTC');
    expect(timezoneFor('AQ')).toBe('UTC');
  });

  it('only gives zones the runtime knows', () => {
    const codes = ['US', 'CA', 'AU', 'GB', 'DE', 'DK', 'FR', 'IN', 'CN', 'BR', 'MX', 'ZA', 'NG', 'AE', 'SG', 'NZ', 'UA', 'AR', 'KZ', 'GL'];
    for (const c of codes) expect(() => new Intl.DateTimeFormat('en', { timeZone: timezoneFor(c) })).not.toThrow();
    for (const loc of ['Austin, TX', 'Boise, ID', 'Indianapolis, IN', 'Detroit, MI', 'Anchorage, AK', 'Regina, SK', "St. John's, NL", 'Whitehorse, YT', 'Darwin NT 0800', 'Hobart TAS'])
      for (const c of ['US', 'CA', 'AU']) expect(() => new Intl.DateTimeFormat('en', { timeZone: timezoneFor(c, loc) })).not.toThrow();
  });
});
