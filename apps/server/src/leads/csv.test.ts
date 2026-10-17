import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS } from '@nvoke/shared';
import { csvCell, toCsv, type CsvRow } from './csv.js';

const row = (over: Partial<CsvRow> = {}): CsvRow => ({
  company: 'Acme ApS',
  domain: 'acme.dk',
  website: 'https://acme.dk/',
  email: 'info@acme.dk',
  kind: 'generic',
  verification: 'valid',
  source_url: 'https://acme.dk/kontakt',
  location: 'Vej 1, 2100 København',
  phone: '+45 12 34 56 78',
  opener: null,
  ...over,
});

describe('csvCell', () => {
  it('quotes commas, quotes, newlines and padded values', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded')).toBe('" padded"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('neutralizes spreadsheet formulas but leaves phone numbers alone', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('+45 12 34 56 78')).toBe('+45 12 34 56 78');
    expect(csvCell('+1 (555) 010-9999')).toBe('+1 (555) 010-9999');
  });
});

describe('toCsv', () => {
  it('writes a BOM, the header in spec order and one CRLF line per row', () => {
    const csv = toCsv([row({ opener: 'Open on Saturdays, rare in Copenhagen.' }), row({ email: 'ole@acme.dk', kind: 'personal', verification: null, company: 'Acme, "the" shop' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('company,domain,website,email,kind,verification,source_url,location,phone,opener');
    expect(lines[0]?.split(',')).toEqual([...CSV_COLUMNS]);
    expect(lines[1]).toBe('Acme ApS,acme.dk,https://acme.dk/,info@acme.dk,generic,valid,https://acme.dk/kontakt,"Vej 1, 2100 København",+45 12 34 56 78,"Open on Saturdays, rare in Copenhagen."');
    expect(lines[2]).toBe('"Acme, ""the"" shop",acme.dk,https://acme.dk/,ole@acme.dk,personal,,https://acme.dk/kontakt,"Vej 1, 2100 København",+45 12 34 56 78,');
    expect(lines[3]).toBe('');
    expect(lines).toHaveLength(4);
  });

  it('writes just the header for no rows', () => {
    expect(toCsv([])).toBe(`${String.fromCharCode(0xfeff)}${CSV_COLUMNS.join(',')}\r\n`);
  });
});
