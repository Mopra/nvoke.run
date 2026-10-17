import { describe, expect, it } from 'vitest';
import type { Company, Email, Person, SiteProfile } from '@nvoke/shared';
import {
  addCountry,
  buildIcpInput,
  canBeOngoing,
  countsLine,
  emptyIcpForm,
  filterCompanies,
  foundViaLabel,
  icpProblem,
  isRoleInbox,
  peopleCounts,
  peopleRows,
  productFromProfile,
  splitLocations,
  stageLine,
} from './icp';

let n = 0;
const id = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const person = (firstName: string, seniority: Person['seniority'], title: string | null = null): Person => ({
  firstName,
  lastName: 'Doe',
  title,
  seniority,
});

const email = (address: string, extra: Partial<Email> = {}): Email => ({
  id: id(),
  address,
  kind: extra.person ? 'personal' : 'generic',
  sourceUrl: null,
  verification: 'valid',
  checkedAt: null,
  ...extra,
});

const company = (name: string, emails: Email[]): Company => ({
  id: id(),
  name,
  domain: `${name.toLowerCase()}.com`,
  website: `https://${name.toLowerCase()}.com`,
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
});

describe('the plain words form', () => {
  it('needs a description and asks for 1,000 companies, capped by the plan', () => {
    const form = emptyIcpForm();
    expect(form.ongoing).toBe(true);
    expect(buildIcpInput(form)).toBeNull();
    expect(icpProblem(form)).toBe('Say who you sell to first.');
    expect(buildIcpInput({ ...form, description: '   ' })).toBeNull();

    const input = buildIcpInput({ ...form, description: '  Dental clinics in Manchester ' });
    expect(input).toEqual({ kind: 'icp', params: { description: 'Dental clinics in Manchester' }, limit: 1000 });
    expect(buildIcpInput({ ...form, description: 'x' }, 250)?.limit).toBe(250);
  });

  it('sends the optional fields only when filled', () => {
    const input = buildIcpInput({
      description: 'Shopify agencies',
      product: ' Cold email infrastructure ',
      countries: ['DE', 'AT'],
      locations: 'Berlin, munich;Berlin\n Hamburg ',
      ongoing: false,
    });
    expect(input).toEqual({
      kind: 'icp',
      params: {
        description: 'Shopify agencies',
        product: 'Cold email infrastructure',
        countries: ['DE', 'AT'],
        locations: ['Berlin', 'munich', 'Hamburg'],
      },
      limit: 1000,
    });
  });

  it('refuses a description over 2,000 characters', () => {
    const form = { ...emptyIcpForm(), description: 'a'.repeat(2001) };
    expect(buildIcpInput(form)).toBeNull();
    expect(icpProblem(form)).toBe('Keep it under 2,000 characters.');
  });

  it('adds each country once and ignores any country', () => {
    expect(addCountry([], 'gb')).toEqual(['GB']);
    expect(addCountry(['GB'], 'GB')).toEqual(['GB']);
    expect(addCountry(['GB'], '')).toEqual(['GB']);
  });

  it('caps locations at 30', () => {
    expect(splitLocations(Array.from({ length: 40 }, (_, i) => `City ${i}`).join(','))).toHaveLength(30);
    expect(splitLocations(' , ,')).toEqual([]);
  });

  it('prefills what you sell from the site profile', () => {
    expect(productFromProfile(null)).toBe('');
    expect(productFromProfile({ profile: { offer: ' Cold email for agencies ' } } as SiteProfile)).toBe('Cold email for agencies');
  });

  it('lets only plain words searches be ongoing, and reads the stage note', () => {
    expect(canBeOngoing({ kind: 'icp' })).toBe(true);
    expect(canBeOngoing({ kind: 'local' })).toBe(false);
    expect(stageLine({ stageNote: ' Found 140 so far. Widening to adjacent niches ' })).toBe(
      'Found 140 so far. Widening to adjacent niches',
    );
    expect(stageLine({ stageNote: null })).toBeNull();
    expect(stageLine({ stageNote: '  ' })).toBeNull();
  });
});

describe('people first results', () => {
  const ceo = email('mia@acme.com', { person: person('Mia', 'founder', 'CEO'), foundVia: 'page' });
  const dev = email('li@acme.com', { person: person('Li', 'staff', 'Developer'), foundVia: 'pattern', verification: 'catch_all' });
  const info = email('info@acme.com');
  const acme = company('Acme', [ceo, dev, info]);
  const hello = email('hello@beta.com', { verification: null });
  const beta = company('Beta', [hello]);
  const nameless = email('jo@gamma.com', { kind: 'personal' });
  const gamma = company('Gamma', [nameless]);

  it('hides shared inboxes where a person is named, and falls back to them where nobody is', () => {
    const rows = peopleRows([acme, beta, gamma]);
    expect(rows.map((r) => r.email.address)).toEqual(['mia@acme.com', 'li@acme.com', 'hello@beta.com', 'jo@gamma.com']);
    expect(rows.map((r) => r.fallback)).toEqual([false, false, true, false]);
    expect(rows[0]?.decisionMaker).toBe(true);
    expect(rows[1]?.decisionMaker).toBe(false);
    expect(isRoleInbox(info)).toBe(true);
    expect(isRoleInbox(nameless)).toBe(false);
  });

  it('shows every address with showAll', () => {
    const rows = peopleRows([acme], { decisionMakersOnly: false, verifiedOnly: false, showAll: true });
    expect(rows.map((r) => r.email.address)).toEqual(['mia@acme.com', 'li@acme.com', 'info@acme.com']);
  });

  it('filters to decision makers and to verified addresses', () => {
    const dms = peopleRows([acme, beta], { decisionMakersOnly: true, verifiedOnly: false, showAll: false });
    expect(dms.map((r) => r.email.address)).toEqual(['mia@acme.com']);
    const verified = peopleRows([acme, beta, gamma], { decisionMakersOnly: false, verifiedOnly: true, showAll: false });
    expect(verified.map((r) => r.email.address)).toEqual(['mia@acme.com', 'jo@gamma.com']);
  });

  it('narrows the companies view the same way', () => {
    const filtered = filterCompanies([acme, beta], { decisionMakersOnly: false, verifiedOnly: true, showAll: false });
    expect(filtered.map((c) => c.name)).toEqual(['Acme']);
    expect(filtered[0]?.emails.map((e) => e.address)).toEqual(['mia@acme.com', 'info@acme.com']);
    expect(filterCompanies([acme], { decisionMakersOnly: false, verifiedOnly: false, showAll: false })[0]).toBe(acme);
  });

  it('says how each address was found', () => {
    expect(foundViaLabel(ceo)).toBe('On their site');
    expect(foundViaLabel({ foundVia: 'cache', verification: 'valid', sourceUrl: null })).toBe('On their site');
    expect(foundViaLabel({ foundVia: 'pattern', verification: 'valid', sourceUrl: null })).toBe('Pattern, server confirmed');
    expect(foundViaLabel(dev)).toBe('Pattern guess');
    expect(foundViaLabel({ foundVia: 'pattern', verification: null, sourceUrl: null })).toBe('Pattern, checking');
    expect(foundViaLabel({ foundVia: null, verification: 'valid', sourceUrl: 'https://acme.com/team' })).toBe('On their site');
    expect(foundViaLabel({ foundVia: undefined, verification: 'valid', sourceUrl: null })).toBeNull();
  });

  it('counts named people, verified people and decision makers', () => {
    const counts = peopleCounts([acme, beta, gamma]);
    expect(counts).toEqual({ people: 2, verifiedPeople: 1, decisionMakers: 1 });
    expect(countsLine(counts, false)).toBe('1 verified person, 1 decision maker');
    expect(countsLine({ people: 40, verifiedPeople: 30, decisionMakers: 12 }, true)).toBe('30+ verified people, 12+ decision makers');
  });
});
