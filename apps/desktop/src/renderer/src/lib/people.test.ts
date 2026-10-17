import { describe, expect, it } from 'vitest';
import { decisionMakersOnly, fitLabel, foundViaLabel, orderEmails, personName, shownEmails } from './people';
import type { Company, Email } from './types';

function email(address: string, extra: Partial<Email> = {}): Email {
  return { id: address, address, kind: 'generic', sourceUrl: null, verification: 'valid', checkedAt: null, ...extra };
}

const ceo = email('anna@acme.com', {
  kind: 'personal',
  person: { firstName: 'Anna', lastName: 'Berg', title: 'CEO', seniority: 'founder' },
  foundVia: 'page',
});
const dev = email('sam@acme.com', {
  kind: 'personal',
  person: { firstName: 'Sam', lastName: 'Lee', title: 'Engineer', seniority: 'staff' },
  foundVia: 'pattern',
});
const info = email('info@acme.com');

function company(emails: Email[]): Company {
  return {
    id: 'c1',
    name: 'Acme',
    domain: 'acme.com',
    website: 'https://acme.com',
    source: 'brave',
    sourceRef: null,
    location: null,
    phone: null,
    category: null,
    crawlStatus: 'done',
    crawledAt: null,
    localCrawl: null,
    emails,
    opener: null,
  };
}

describe('people', () => {
  it('orders decision makers first, then people, then inboxes', () => {
    expect(orderEmails([info, dev, ceo]).map((e) => e.address)).toEqual(['anna@acme.com', 'sam@acme.com', 'info@acme.com']);
  });

  it('hides role inboxes when the company has a person', () => {
    expect(shownEmails(company([info, ceo]), false)).toEqual({ emails: [ceo], fallback: false, hidden: 1 });
    expect(shownEmails(company([info, ceo]), true).emails).toHaveLength(2);
  });

  it('falls back to role inboxes when there is no person', () => {
    expect(shownEmails(company([info]), false)).toEqual({ emails: [info], fallback: true, hidden: 0 });
    expect(shownEmails(company([]), false).fallback).toBe(false);
  });

  it('keeps decision makers only', () => {
    const out = decisionMakersOnly([company([info, dev, ceo]), { ...company([info]), id: 'c2' }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.emails).toEqual([ceo]);
  });

  it('says how an address was found', () => {
    expect(foundViaLabel(ceo)).toBe('On their site');
    expect(foundViaLabel(dev)).toBe('Pattern, server confirmed');
    expect(foundViaLabel({ ...dev, verification: 'catch_all' })).toBe('Pattern guess');
    expect(foundViaLabel(info)).toBeNull();
  });

  it('names people and fit', () => {
    expect(personName(ceo)).toBe('Anna Berg');
    expect(personName(info)).toBeNull();
    expect(fitLabel(80)).toBe('Strong fit');
    expect(fitLabel(null)).toBeNull();
  });
});
