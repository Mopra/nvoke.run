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
  emails: [],
  ...over,
});

const email = { id: 'e1', address: 'info@acme.dk', kind: 'generic', sourceUrl: null, verification: 'valid', checkedAt: null } as const;

describe('companiesToTsv', () => {
  it('writes a header and one row per email, tab separated', () => {
    const lines = companiesToTsv([company({ emails: [email, { ...email, id: 'e2', address: 'bo@acme.dk' }] })]).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]!.split('\t')).toHaveLength(9);
    expect(lines[1]).toBe('Acme\tacme.dk\thttps://acme.dk\tinfo@acme.dk\tgeneric\tvalid\t\tAarhus\t+45 12 34 56 78');
  });

  it('keeps a company without emails and flattens tabs and line breaks', () => {
    const [, row] = companiesToTsv([company({ name: 'A\tB\nC' })]).trim().split('\n');
    expect(row).toBe('A B C\tacme.dk\thttps://acme.dk\t\t\t\t\tAarhus\t+45 12 34 56 78');
  });

  it('defuses formulas but leaves phone numbers alone', () => {
    const [, row] = companiesToTsv([company({ name: '=HYPERLINK("x")' })]).trim().split('\n');
    expect(row!.startsWith(`'=HYPERLINK`)).toBe(true);
    expect(row!.endsWith('+45 12 34 56 78')).toBe(true);
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
