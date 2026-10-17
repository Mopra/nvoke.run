import { describe, expect, it } from 'vitest';
import { mergeRender, renderTable, type RenderResult, type SiteResult } from './crawl-bench.js';

const site = (domain: string, status: SiteResult['status'], emails: string[] = []): SiteResult => ({
  source: 'local',
  domain,
  status,
  emails,
  generic: emails.length,
  personal: 0,
  deliverable: 0,
  via: emails.length ? ['text'] : [],
  pages: 1,
  ms: 1_000,
});

const read = (domain: string, emails: string[]): RenderResult => ({
  domain,
  outcome: 'done',
  emails: emails.map((address) => ({ address, sourceUrl: `https://${domain}/` })),
  pages: 2,
  ms: 3_000,
});

describe('mergeRender', () => {
  const server = [site('spa.dk', 'js_only'), site('quiet.dk', 'done'), site('found.dk', 'done', ['info@found.dk'])];
  const render = [read('spa.dk', ['info@spa.dk', 'anna@spa.dk']), read('quiet.dk', ['hej@quiet.dk']), read('found.dk', ['other@found.dk'])];

  it('takes the desktop addresses only for misses the rule hands over', async () => {
    const merged = await mergeRender(server, render, (r) => r.status === 'js_only');
    expect(merged[0]).toMatchObject({ emails: ['info@spa.dk', 'anna@spa.dk'], generic: 1, personal: 1, via: ['desktop'], pages: 3, ms: 4_000 });
    expect(merged[1]!.emails).toEqual([]);
    expect(merged[2]!.emails).toEqual(['info@found.dk']);
  });

  it('counts what the desktop read per server outcome', () => {
    const table = renderTable(server, render.slice(0, 2), (r) => r.status === 'js_only');
    expect(table).toContain('| js_only | 1 | 1 | 1 | 0 | 0 | 1 | 2 |');
    expect(table).toContain('| done, no email | 1 | 0 | 1 | 0 | 0 | 1 | 1 |');
    expect(table).toContain('| all | 2 | 1 |');
  });
});
