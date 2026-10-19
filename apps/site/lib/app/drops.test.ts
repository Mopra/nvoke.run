import { describe, expect, it } from 'vitest';
import { DROP_DAILY_LIMIT_DEFAULT, DROP_DAILY_LIMIT_MAX, type Drop, type FeedSourceStatus, type Search } from '@nvoke/shared';
import {
  buildCreateDrop,
  buildUpdateDrop,
  clampLimit,
  dropLimitPresets,
  dropForm,
  dropPath,
  dropRuns,
  dropsPollInterval,
  dropState,
  dropSummary,
  DROPS_POLL_MS,
  feedTotal,
  storeDrop,
  toggleSource,
} from './drops';

const NOW = Date.parse('2026-10-19T12:00:00Z');

const drop = (over: Partial<Drop> = {}): Drop => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'AI agents',
  keyword: 'ai agents',
  sources: ['show_hn', 'yc'],
  dailyLimit: 25,
  enabled: true,
  nextRunAt: '2026-10-20T07:00:00Z',
  lastDeliveredAt: null,
  companiesDelivered: 0,
  createdAt: '2026-10-10T07:00:00Z',
  ...over,
});

const run = (id: string, dropId: string, createdAt: string, status: Search['status'] = 'done'): Search =>
  ({
    id,
    kind: 'drop',
    status,
    createdAt,
    params: { dropId, dropName: 'AI agents', sources: ['yc'] },
  }) as unknown as Search;

const status = (source: FeedSourceStatus['source'], lastWeek: number, available = true): FeedSourceStatus => ({
  source,
  available,
  lastWeek,
  lastCollectedAt: null,
});

describe('dropRuns', () => {
  it('keeps the drop searches of one drop, newest first', () => {
    const other = { id: 'x', kind: 'local', createdAt: '2026-10-19T00:00:00Z', params: {} } as unknown as Search;
    const id = drop().id;
    const runs = dropRuns([run('a', id, '2026-10-17T07:00:00Z'), other, run('b', 'someone-else', '2026-10-18T07:00:00Z'), run('c', id, '2026-10-18T07:00:00Z')], id);
    expect(runs.map((r) => r.id)).toEqual(['c', 'a']);
    expect(dropRuns(undefined, id)).toEqual([]);
  });
});

describe('dropSummary', () => {
  it('names the keyword, the sources and the limit', () => {
    expect(dropSummary(drop())).toBe('"ai agents" from Show HN and Y Combinator, up to 25 a day');
    expect(dropSummary(drop({ keyword: null, sources: ['show_hn', 'launch_hn', 'product_hunt', 'yc'] }))).toBe(
      'Every launch from every source, up to 25 a day',
    );
  });
});

describe('dropState', () => {
  it('is running while a run crawls, paused when off, due within a minute, daily otherwise', () => {
    expect(dropState(drop(), [run('a', 'd', '2026-10-19T07:00:00Z', 'running')], NOW)).toBe('running');
    expect(dropState(drop({ enabled: false }), [], NOW)).toBe('paused');
    expect(dropState(drop({ nextRunAt: '2026-10-19T12:00:30Z' }), [], NOW)).toBe('due');
    expect(dropState(drop({ nextRunAt: '2026-10-19T11:00:00Z' }), [], NOW)).toBe('due');
    expect(dropState(drop(), [], NOW)).toBe('daily');
  });
});

describe('dropsPollInterval', () => {
  it('polls only while an enabled drop is due', () => {
    expect(dropsPollInterval(undefined, NOW)).toBe(false);
    expect(dropsPollInterval({ drops: [drop()], sources: [] }, NOW)).toBe(false);
    expect(dropsPollInterval({ drops: [drop({ nextRunAt: '2026-10-19T11:59:00Z' })], sources: [] }, NOW)).toBe(DROPS_POLL_MS);
    expect(dropsPollInterval({ drops: [drop({ enabled: false, nextRunAt: '2026-10-19T11:59:00Z' })], sources: [] }, NOW)).toBe(false);
  });
});

describe('feedTotal', () => {
  it('adds up the sources the server collects', () => {
    expect(feedTotal([status('show_hn', 12), status('yc', 30), status('product_hunt', 99, false)])).toBe(42);
  });
});

describe('the drop form', () => {
  it('starts a new drop with every source the server collects', () => {
    const form = dropForm(undefined, [status('show_hn', 1), status('product_hunt', 0, false)], 'crm');
    expect(form).toEqual({ keyword: 'crm', sources: ['show_hn', 'launch_hn', 'yc'], limit: DROP_DAILY_LIMIT_DEFAULT, name: '' });
  });

  it('opens an existing drop as it is', () => {
    expect(dropForm(drop({ keyword: null }), [])).toEqual({ keyword: '', sources: ['show_hn', 'yc'], limit: 25, name: 'AI agents' });
  });

  it('toggles a source and keeps the feed order', () => {
    expect(toggleSource(['yc'], 'show_hn')).toEqual(['show_hn', 'yc']);
    expect(toggleSource(['show_hn', 'yc'], 'yc')).toEqual(['show_hn']);
  });

  it('clamps the limit and falls back to the default', () => {
    expect(clampLimit(Number.NaN)).toBe(DROP_DAILY_LIMIT_DEFAULT);
    expect(clampLimit(99_999)).toBe(DROP_DAILY_LIMIT_MAX);
    expect(clampLimit(1000, 200)).toBe(200);
    expect(clampLimit(-3)).toBe(1);
    expect(clampLimit(12.4)).toBe(12);
  });

  it('ends the presets at the plan max', () => {
    expect(dropLimitPresets(200)).toEqual([10, 25, 50, 100, 200]);
    expect(dropLimitPresets(50)).toEqual([10, 25, 50]);
  });

  it('builds a create request, naming it after the keyword when the name is empty', () => {
    expect(buildCreateDrop({ keyword: ' ai agents ', sources: ['yc'], limit: 50, name: '' })).toEqual({
      name: 'Ai agents',
      keyword: 'ai agents',
      sources: ['yc'],
      dailyLimit: 50,
    });
    expect(buildCreateDrop({ keyword: '', sources: ['yc'], limit: 50, name: '' })).toEqual({ name: 'Every launch', sources: ['yc'], dailyLimit: 50 });
    expect(buildCreateDrop({ keyword: '', sources: [], limit: 50, name: '' })).toBeNull();
  });

  it('builds an update that removes an emptied keyword', () => {
    expect(buildUpdateDrop({ keyword: '', sources: ['yc'], limit: 10, name: 'Mine' })).toEqual({
      name: 'Mine',
      keyword: null,
      sources: ['yc'],
      dailyLimit: 10,
    });
  });
});

describe('storeDrop', () => {
  it('replaces a known drop in place and puts a new one first', () => {
    const a = drop();
    const b = drop({ id: '22222222-2222-4222-8222-222222222222', name: 'B' });
    const list = { drops: [a], sources: [] };
    expect(storeDrop(list, { ...a, name: 'Renamed' })?.drops.map((d) => d.name)).toEqual(['Renamed']);
    expect(storeDrop(list, b)?.drops.map((d) => d.name)).toEqual(['B', 'AI agents']);
    expect(storeDrop(undefined, b)).toBeUndefined();
  });
});

describe('dropPath', () => {
  it('links a drop', () => {
    expect(dropPath('abc')).toBe('/app/drops/abc');
  });
});
