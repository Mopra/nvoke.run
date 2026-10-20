import { describe, expect, it } from 'vitest';
import { CreateSearchRequest } from './leads.js';
import { itemDomain, splitList } from './lists.js';

describe('itemDomain', () => {
  it('reads domains, URLs and email addresses', () => {
    expect(itemDomain('acme.com')).toBe('acme.com');
    expect(itemDomain('  WWW.Acme.co.uk ')).toBe('acme.co.uk');
    expect(itemDomain('https://www.figma.com/about?x=1#top')).toBe('figma.com');
    expect(itemDomain('http://shop.acme.dk:8080/')).toBe('shop.acme.dk');
    expect(itemDomain('jane@raycast.com')).toBe('raycast.com');
    expect(itemDomain('Booking.com')).toBe('booking.com');
  });

  it('calls anything else a name', () => {
    expect(itemDomain('Novo Nordisk')).toBeNull();
    expect(itemDomain('Pleo')).toBeNull();
    expect(itemDomain('Acme Inc.')).toBeNull();
    expect(itemDomain('localhost')).toBeNull();
    expect(itemDomain('10.0.0.1')).toBeNull();
    expect(itemDomain('')).toBeNull();
  });
});

describe('splitList', () => {
  it('takes one item per line and drops bullets, numbers, quotes and blanks', () => {
    const text = '- linear.app\r\n\n  2. "Too Good To Go"\n• Pleo\n';
    expect(splitList(text)).toEqual(['linear.app', 'Too Good To Go', 'Pleo']);
  });

  it('splits a line on commas only when every part is a domain', () => {
    expect(splitList('vercel.com, supabase.com;neon.tech')).toEqual(['vercel.com', 'supabase.com', 'neon.tech']);
    expect(splitList('Acme, Inc.')).toEqual(['Acme, Inc.']);
  });

  it('dedupes domains by host and names ignoring case', () => {
    expect(splitList('acme.com\nhttps://www.acme.com/contact\nhi@acme.com\nPleo\npleo')).toEqual(['acme.com', 'Pleo']);
  });

  it('stops at the cap', () => {
    const text = Array.from({ length: 30 }, (_, i) => `site${i}.com`).join('\n');
    expect(splitList(text, 5)).toHaveLength(5);
  });
});

describe('domains search request', () => {
  it('trims and dedupes items, and needs at least one', () => {
    const parsed = CreateSearchRequest.parse({ kind: 'domains', params: { items: [' acme.com ', 'www.acme.com', 'Pleo'], country: 'DK' } });
    expect(parsed).toEqual({ kind: 'domains', params: { items: ['acme.com', 'Pleo'], country: 'dk' } });
    expect(CreateSearchRequest.safeParse({ kind: 'domains', params: { items: [] } }).success).toBe(false);
    expect(CreateSearchRequest.safeParse({ kind: 'domains', params: { items: [''] } }).success).toBe(false);
    expect(CreateSearchRequest.safeParse({ kind: 'domains', params: { items: Array(25_001).fill('a.com') } }).success).toBe(false);
  });
});
