import { describe, expect, it } from 'vitest';
import { columnItems, enrichCsv, guessColumn, parseTable } from './table';
import type { Company } from './types';

describe('parseTable', () => {
  it('reads quotes, doubled quotes and line breaks inside a cell', () => {
    const t = parseTable('name,notes\r\n"Acme, Inc.","said ""hi""\nthere"\r\nPleo,\r\n');
    expect(t?.headers).toEqual(['name', 'notes']);
    expect(t?.rows).toEqual([
      ['Acme, Inc.', 'said "hi"\nthere'],
      ['Pleo', ''],
    ]);
  });

  it('detects semicolons and tabs and strips the byte order mark', () => {
    expect(parseTable('﻿domain;city\nacme.com;Aarhus')?.rows).toEqual([['acme.com', 'Aarhus']]);
    expect(parseTable('domain\tcity\nacme.com\tAarhus')?.headers).toEqual(['domain', 'city']);
  });

  it('treats a first row of domains as data', () => {
    const t = parseTable('acme.com\nlinear.app\n');
    expect(t?.hasHeader).toBe(false);
    expect(t?.headers).toEqual(['Column 1']);
    expect(t?.rows).toHaveLength(2);
  });

  it('returns null for nothing to read', () => {
    expect(parseTable('')).toBeNull();
    expect(parseTable('\r\n\r\n')).toBeNull();
  });
});

describe('guessColumn', () => {
  it('prefers the column of domains over a company name column', () => {
    const t = parseTable('Company,Website,City\nAcme,https://acme.com,Aarhus\nPleo,pleo.io,Copenhagen')!;
    expect(guessColumn(t)).toBe(1);
  });

  it('falls back to the name column when nothing is a domain', () => {
    const t = parseTable('id,Company name,Notes\n1,Acme,x\n2,Pleo,y')!;
    expect(guessColumn(t)).toBe(1);
  });

  it('finds domains in a file without a header', () => {
    const t = parseTable('Acme,acme.com\nPleo,pleo.io')!;
    expect(guessColumn(t)).toBe(1);
  });
});

describe('columnItems', () => {
  const t = parseTable('site\nacme.com\nhttps://www.acme.com/about\n\nPleo\nlinear.app')!;

  it('dedupes by domain and keeps rows pointing at their item', () => {
    const c = columnItems(t, 0, 10);
    expect(c.items).toEqual(['acme.com', 'Pleo', 'linear.app']);
    expect(c.rowItems).toEqual(['acme.com', 'https://www.acme.com/about', 'Pleo', 'linear.app']);
    expect(c.domains).toBe(2);
    expect(c.names).toBe(1);
  });

  it('cuts at the limit and counts what it left out', () => {
    const c = columnItems(t, 0, 2);
    expect(c.items).toEqual(['acme.com', 'Pleo']);
    expect(c.skipped).toBe(1);
    expect(c.rowItems.at(-1)).toBeNull();
  });
});

function company(name: string, domain: string, emails: Company['emails'] = []): Company {
  return {
    id: domain,
    name,
    domain,
    website: `https://${domain}/`,
    source: 'list',
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
const email = (address: string, kind: 'generic' | 'personal', verification: 'valid' | 'risky' | null) => ({
  id: address,
  address,
  kind,
  sourceUrl: null,
  verification,
  checkedAt: null,
});

describe('enrichCsv', () => {
  it('appends domain, email, kind and verification, one row per email', () => {
    const t = parseTable('Company,Site\n"Acme, Inc.",acme.com\nPleo,\nGhost,ghost.dev')!;
    const { rowItems } = columnItems(t, 1, 10);
    const csv = enrichCsv(t, rowItems, [
      company('acme.com', 'acme.com', [email('info@acme.com', 'generic', 'valid'), email('=jo@acme.com', 'personal', 'risky')]),
    ]).replace('﻿', '');
    expect(csv.split('\r\n')).toEqual([
      'Company,Site,domain,email,kind,verification',
      '"Acme, Inc.",acme.com,acme.com,info@acme.com,generic,valid',
      '"Acme, Inc.",acme.com,acme.com,\'=jo@acme.com,personal,risky',
      'Pleo,,,,,',
      'Ghost,ghost.dev,,,,',
      '',
    ]);
  });

  it('matches a looked up name by the company name and keeps the resolved domain', () => {
    const t = parseTable('Company\nPleo')!;
    const { rowItems } = columnItems(t, 0, 10);
    const csv = enrichCsv(t, rowItems, [company('Pleo', 'pleo.io', [email('hi@pleo.io', 'generic', 'valid')])]);
    expect(csv).toContain('Pleo,pleo.io,hi@pleo.io,generic,valid');
  });

  it('renames an added column the file already has', () => {
    const t = parseTable('domain,email\nacme.com,old@acme.com')!;
    const csv = enrichCsv(t, columnItems(t, 0, 10).rowItems, []);
    expect(csv.split('\r\n')[0]).toContain('domain,email,nvoke_domain,nvoke_email,kind,verification');
  });
});
