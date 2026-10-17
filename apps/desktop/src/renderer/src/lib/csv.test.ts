import { describe, expect, it } from 'vitest';
import { companiesToCsv, companiesToTsv } from './csv';
import type { Company } from './types';

const company = (over: Partial<Company>): Company => ({
  id: 'c1',
  name: 'Acme',
  domain: 'acme.dk',
  website: 'https://acme.dk',
  source: 'osm',
  sourceRef: null,
  location: 'Aarhus',
  phone: '+45 12 34 56 78',
  category: null,
  crawlStatus: 'done',
  crawledAt: null,
  localCrawl: null,
  emails: [],
  opener: null,
  ...over,
});

const email = { id: 'e1', address: 'info@acme.dk', kind: 'generic', sourceUrl: null, verification: 'valid', checkedAt: null } as const;

describe('companiesToTsv', () => {
  it('writes a header and one row per email, tab separated', () => {
    const lines = companiesToTsv([company({ emails: [email, { ...email, id: 'e2', address: 'bo@acme.dk' }] })]).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]!.split('\t')).toHaveLength(16);
    expect(lines[1]).toBe('Acme\tacme.dk\thttps://acme.dk\tinfo@acme.dk\t\t\t\t\tgeneric\tvalid\t\t\t\tAarhus\t+45 12 34 56 78\t');
  });

  it('keeps a company without emails and flattens tabs and line breaks', () => {
    const [, row] = companiesToTsv([company({ name: 'A\tB\nC' })]).trim().split('\n');
    expect(row).toBe(`A B C\tacme.dk\thttps://acme.dk${'\t'.repeat(11)}Aarhus\t+45 12 34 56 78`);
  });

  it('defuses formulas but leaves phone numbers alone', () => {
    const [, row] = companiesToTsv([company({ name: '=HYPERLINK("x")', emails: [email] })]).trim().split('\n');
    expect(row!.startsWith(`'=HYPERLINK`)).toBe(true);
    expect(row!.split('\t')[14]).toBe('+45 12 34 56 78');
  });
});

describe('the person columns', () => {
  it('writes the person, how the address was found and the confidence', () => {
    const named = { ...email, id: 'e3', address: 'ole@acme.dk', kind: 'personal', person: { firstName: 'Ole', lastName: 'Berg', title: 'CEO', seniority: 'founder' }, foundVia: 'page', confidence: 90 } as const;
    const [header, row] = companiesToCsv([company({ emails: [named] })]).trim().split(/\r\n/);
    const cells = Object.fromEntries(header!.split(',').map((h, i) => [h, row!.split(',')[i]]));
    expect(cells).toMatchObject({ email: 'ole@acme.dk', first_name: 'Ole', last_name: 'Berg', title: 'CEO', seniority: 'founder', found_via: 'page', confidence: '90' });
  });
});

describe('the opener column', () => {
  const done = {
    status: 'done',
    line: 'Saw you opened a second clinic in Aarhus.',
    sourceUrl: 'https://acme.dk/news',
    quote: 'Our second clinic',
    draftedAt: null,
  } as const;

  it('carries a drafted line on every row of the company and nothing otherwise', () => {
    const lines = companiesToTsv([
      company({ opener: done, emails: [email, { ...email, id: 'e2', address: 'bo@acme.dk' }] }),
      company({ id: 'c2', opener: { ...done, status: 'queued', line: null }, emails: [email] }),
    ]).split('\n');
    expect(lines[0]!.split('\t').at(-1)).toBe('opener');
    expect(lines[1]!.split('\t').at(-1)).toBe(done.line);
    expect(lines[2]!.split('\t').at(-1)).toBe(done.line);
    expect(lines[3]!.split('\t').at(-1)).toBe('');
  });

  it('reads an older local copy without the field as blank', () => {
    const { opener: _gone, ...old } = company({ emails: [email] });
    const csv = companiesToCsv([old as Company]);
    expect(csv.split('\r\n')[1]!.endsWith(',+45 12 34 56 78,')).toBe(true);
  });

  it('quotes a line with a comma in the CSV', () => {
    const csv = companiesToCsv([company({ emails: [email], opener: { ...done, line: 'Two clinics, one team.' } })]);
    expect(csv).toContain(',"Two clinics, one team."\r\n');
  });
});

describe('companiesToCsv for a drag', () => {
  it('can include companies without emails and a byte order mark', () => {
    const csv = companiesToCsv([company({})], { includeEmpty: true, bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.trim().split('\r\n')).toHaveLength(2);
    expect(companiesToCsv([company({})]).trim().split('\r\n')).toHaveLength(1);
  });
});
