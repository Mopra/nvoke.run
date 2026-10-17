import { describe, expect, it } from 'vitest';
import { handsToLocalCrawl, LocalCrawlClaimRequest } from './local-crawl.js';

describe('handsToLocalCrawl', () => {
  it('hands refused, JS-only and read sites over only while they have no address', () => {
    expect(handsToLocalCrawl('refused', 0)).toBe(true);
    expect(handsToLocalCrawl('js_only', 0)).toBe(true);
    expect(handsToLocalCrawl('done', 0)).toBe(true);
    expect(handsToLocalCrawl('done', 2)).toBe(false);
    expect(handsToLocalCrawl('failed', 0)).toBe(false);
    expect(handsToLocalCrawl('blocked', 0)).toBe(false);
  });
});

describe('LocalCrawlClaimRequest', () => {
  it('defaults to the reasons older desktops read', () => {
    expect(LocalCrawlClaimRequest.parse({})).toEqual({ max: 3, reasons: ['refused', 'js_only'] });
    expect(LocalCrawlClaimRequest.safeParse({ reasons: ['blocked'] }).success).toBe(false);
  });
});
