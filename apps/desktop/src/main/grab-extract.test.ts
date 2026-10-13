import { describe, expect, it } from 'vitest';
import { extractCompanies, splitColumns } from './grab-extract';
import { windowsSegments } from './ocr';

const texts = (segments: string[]): string[] => extractCompanies(segments).items.map((i) => i.text);

describe('extractCompanies', () => {
  it('reads an exhibitor list and leaves out headers, booths and countries', () => {
    const { items, people } = extractCompanies([
      'Exhibitor',
      'Booth',
      'Emails O',
      'Country',
      'Acme Robotics GmbH',
      'B12',
      'Germany',
      '1. Pleo',
      'Too Good To Go, Stand 4B',
      'Novo Nordisk A/S',
      'Denmark',
    ]);
    expect(items).toEqual([
      { text: 'Acme Robotics GmbH', kind: 'name' },
      { text: 'Pleo', kind: 'name' },
      { text: 'Too Good To Go', kind: 'name' },
      { text: 'Novo Nordisk A/S', kind: 'name' },
    ]);
    expect(people).toBe(0);
  });

  it('keeps domains from domains, URLs and work addresses', () => {
    const { items } = extractCompanies(['linear.app', 'https://www.figma.com/about', 'Contact: hello@raycast.com', 'brochure.pdf', 'Read the README.md']);
    expect(items).toEqual([
      { text: 'linear.app', kind: 'domain' },
      { text: 'figma.com', kind: 'domain' },
      { text: 'raycast.com', kind: 'domain' },
    ]);
  });

  it('drops people: names, titles and personal addresses', () => {
    const { items, people } = extractCompanies([
      'Anna Berg',
      'Lars H. Nielsen',
      'Chief Executive Officer',
      'jane.doe@gmail.com',
      'Head of Sales at Too Good To Go',
      'Software Engineer at Vercel · 2nd',
    ]);
    expect(items.map((i) => i.text)).toEqual(['Too Good To Go', 'Vercel']);
    expect(people).toBe(6);
  });

  it('keeps a company with a legal form even when it starts with a first name', () => {
    expect(texts(['Anna Berg ApS', 'Peter Larsen Kaffe A/S'])).toEqual(['Anna Berg ApS', 'Peter Larsen Kaffe A/S']);
  });

  it('skips prose, counts and buttons', () => {
    expect(texts(['We help teams ship faster with less code', '1,204 followers', 'Follow', 'See all', '2nd', '12/04/2026'])).toEqual([]);
  });

  it('dedupes names ignoring case and domains by host', () => {
    expect(texts(['Pleo', 'PLEO', 'pleo.io', 'www.pleo.io'])).toEqual(['Pleo', 'pleo.io']);
  });
});

describe('splitColumns', () => {
  it('splits a table row on wide gaps', () => {
    const row = [
      { text: 'Acme', x: 0, width: 50 },
      { text: 'GmbH', x: 58, width: 50 },
      { text: 'B12', x: 400, width: 30 },
      { text: 'Germany', x: 600, width: 80 },
    ];
    expect(splitColumns(row, 30)).toEqual(['Acme GmbH', 'B12', 'Germany']);
  });
});

describe('windowsSegments', () => {
  it('reads PowerShell output, including collapsed one-word lines', () => {
    const lines = [
      [
        ['Acme', 0, 50, 20],
        ['GmbH', 58, 50, 20],
        ['Germany', 600, 80, 20],
      ],
      ['Pleo', 0, 40, 20],
    ];
    expect(windowsSegments(lines)).toEqual(['Acme GmbH', 'Germany', 'Pleo']);
    expect(windowsSegments(null)).toEqual([]);
  });
});
