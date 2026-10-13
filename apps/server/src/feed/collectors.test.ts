import { describe, expect, it } from 'vitest';
import { fakeFetch, silentLog } from '../testing/fakes.js';
import { ALGOLIA_SEARCH } from '../leads/sources/launches.js';
import {
  YC_META,
  createCollectors,
  firstCompanySite,
  launchHnItem,
  newestYcBatches,
  parseLaunchHnTitle,
  showHnItem,
  sourceAvailability,
  ycItem,
} from './collectors.js';

const NOW = new Date('2026-10-13T12:00:00Z');
const ctx = () => ({ since: new Date('2026-10-12T00:00:00Z'), now: NOW, signal: new AbortController().signal, log: silentLog });

describe('feed collectors', () => {
  it('parses Launch HN titles', () => {
    expect(parseLaunchHnTitle('Launch HN: Consus (YC F24) \u2013 LLM gateway for sensitive data')).toEqual({
      name: 'Consus',
      batch: 'YC F24',
      tagline: 'LLM gateway for sensitive data',
    });
    expect(parseLaunchHnTitle('Launch HN: Plain')).toEqual({ name: 'Plain', batch: null, tagline: null });
  });

  it('picks the first link that is a company site', () => {
    expect(firstCompanySite(['https://youtu.be/x', 'https://www.loom.com/share/1', 'https://acme.ai/docs'])).toBe('https://acme.ai/docs');
    expect(firstCompanySite([null, 'mailto:a@b.c', 'https://github.com/acme'])).toBeNull();
  });

  it('turns a Show HN hit into an item and skips text posts', () => {
    expect(
      showHnItem({ objectID: '1', title: 'Show HN: Widgetly \u2013 widgets for teams', url: 'https://widgetly.io', created_at_i: 1_760_000_000 }),
    ).toEqual({
      source: 'show_hn',
      sourceRef: '1',
      name: 'Widgetly',
      website: 'https://widgetly.io/',
      tagline: 'widgets for teams',
      description: undefined,
      launchedAt: new Date(1_760_000_000_000),
    });
    expect(showHnItem({ objectID: '2', title: 'Show HN: my essay', url: null })).toBeNull();
  });

  it('finds a Launch HN site in the story text when the post has no URL', () => {
    const item = launchHnItem({
      objectID: '9',
      title: 'Launch HN: Agent37 (YC F26) \u2013 Cheap agent sandboxes',
      url: null,
      story_text: 'Hi HN! Demo: <a href="https:&#x2F;&#x2F;youtu.be&#x2F;x">video</a>. Try it at <a href="https:&#x2F;&#x2F;agent37.dev">agent37.dev</a>',
    });
    expect(item).toMatchObject({ source: 'launch_hn', name: 'Agent37', website: 'https://agent37.dev/', tags: ['YC F26'] });
    expect(item?.description).toContain('Try it at agent37.dev');
  });

  it('orders YC batches newest first', () => {
    expect(newestYcBatches(['winter-2026', 'unspecified', 'fall-2026', 'summer-2025', 'spring-2026', 'winter-2027'])).toEqual([
      'winter-2027',
      'fall-2026',
      'spring-2026',
    ]);
  });

  it('keeps active YC companies with a site', () => {
    expect(ycItem({ slug: 'baud', name: 'Baud', website: 'https://baudlabs.ai', one_liner: 'AI chips', tags: ['Hard Tech'], batch: 'Summer 2026', status: 'Active' })).toMatchObject({
      source: 'yc',
      sourceRef: 'baud',
      website: 'https://baudlabs.ai/',
      tagline: 'AI chips',
      tags: ['Hard Tech', 'Summer 2026'],
    });
    expect(ycItem({ slug: 'gone', name: 'Gone', website: 'https://gone.io', status: 'Inactive' })).toBeNull();
    expect(ycItem({ slug: 'nosite', name: 'No site', website: null })).toBeNull();
  });

  it('collects Show HN since the given moment', async () => {
    const fetch = fakeFetch({
      [ALGOLIA_SEARCH]: (url) => {
        expect(url.searchParams.get('tags')).toBe('show_hn');
        expect(url.searchParams.get('numericFilters')).toBe(`created_at_i>${Date.parse('2026-10-12T00:00:00Z') / 1000}`);
        return { body: JSON.stringify({ nbPages: 1, hits: [{ objectID: '1', title: 'Show HN: A', url: 'https://a.io' }, { objectID: '2', title: 'Show HN: B' }] }) };
      },
    });
    const showHn = createCollectors({ productHuntToken: undefined, fetch }).find((c) => c.source === 'show_hn')!;
    const items = await showHn.collect(ctx());
    expect(items.map((i) => i.name)).toEqual(['A']);
  });

  it('collects the newest YC batches', async () => {
    const fetch = fakeFetch({
      [YC_META]: {
        body: JSON.stringify({
          batches: {
            'fall-2026': { api: 'https://yc.test/fall-2026.json' },
            'winter-2012': { api: 'https://yc.test/winter-2012.json' },
          },
        }),
      },
      'https://yc.test/fall-2026.json': { body: JSON.stringify([{ slug: 'x', name: 'X', website: 'https://x.ai', status: 'Active' }]) },
      'https://yc.test/winter-2012.json': { body: JSON.stringify([{ slug: 'old', name: 'Old', website: 'https://old.com', status: 'Active' }]) },
    });
    const yc = createCollectors({ productHuntToken: undefined, fetch }).find((c) => c.source === 'yc')!;
    const items = await yc.collect(ctx());
    // Three newest batches: both are in, since only two exist.
    expect(items.map((i) => i.sourceRef).sort()).toEqual(['old', 'x']);
  });

  it('marks Product Hunt unavailable without a token', () => {
    expect(sourceAvailability(createCollectors({ productHuntToken: undefined }))).toEqual({
      show_hn: true,
      launch_hn: true,
      product_hunt: false,
      yc: true,
    });
  });
});
