import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureAccount } from '../leads/quota.js';
import { periodOf } from '../leads/plans.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { collectDue, storeItems } from './collect.js';
import type { FeedCollector, FeedItemInput } from './collectors.js';
import { createDrop, dropAdapter, DropRunInternal, listDrops, nextRunAfter, runDueDrops } from './drops.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, feed_items, feed_sources cascade`;
});

const NOW = new Date('2026-10-13T06:00:00Z');
const DAY = 86_400_000;

function item(ref: string, over: Partial<FeedItemInput> = {}): FeedItemInput {
  return { source: 'show_hn', sourceRef: ref, name: `Product ${ref}`, website: `https://${ref}.io`, launchedAt: NOW, ...over };
}

async function drop(over: { keyword?: string; sources?: ('show_hn' | 'launch_hn' | 'product_hunt' | 'yc')[]; dailyLimit?: number } = {}) {
  await ensureAccount(db.sql, 'u1');
  const d = await createDrop(db.sql, 'u1', { name: 'AI tools', ...over });
  await db.sql`update drops set next_run_at = ${NOW} where id = ${d.id}`;
  return d;
}

async function dropSearches(dropId: string) {
  return db.sql<{ id: string; kind: string; params: DropRunInternal; limit: number }[]>`
    select id, kind, params, "limit" from searches where drop_id = ${dropId} order by created_at`;
}

/** Runs the find step's adapter for a drop search and inserts its companies, as runFind would. */
async function deliver(searchId: string) {
  const [s] = await db.sql<{ params: DropRunInternal; limit: number }[]>`select params, "limit" from searches where id = ${searchId}`;
  const found: string[] = [];
  for await (const c of dropAdapter(() => db.sql).find(DropRunInternal.parse(s!.params), {
    limit: s!.limit,
    signal: new AbortController().signal,
    log: silentLog,
  })) {
    if (found.length >= s!.limit) break;
    found.push(new URL(c.website).hostname);
    await db.sql`
      insert into companies (search_id, clerk_user_id, name, domain, website, source)
      values (${searchId}, 'u1', ${c.name}, ${new URL(c.website).hostname}, ${c.website}, ${c.source})`;
  }
  return found;
}

describe('feed storage', () => {
  it('stores new items once and skips platform sites', async () => {
    expect(await storeItems(db.sql, [item('a'), item('b'), item('gh', { website: 'https://github.com/x/y' })], NOW)).toBe(2);
    expect(await storeItems(db.sql, [item('a'), item('c')], NOW)).toBe(1);
    const rows = await db.sql<{ domain: string; search_text: string }[]>`select domain, search_text from feed_items order by id`;
    expect(rows.map((r) => r.domain)).toEqual(['a.io', 'b.io', 'c.io']);
    expect(rows[0]!.search_text).toBe('product a');
  });

  it('runs a collector only when its interval has passed and records failures', async () => {
    let calls = 0;
    const ok: FeedCollector = { source: 'show_hn', everyMs: 30 * 60_000, available: true, collect: async () => (calls++, [item('a')]) };
    const broken: FeedCollector = { source: 'yc', everyMs: 60_000, available: true, collect: async () => Promise.reject(new Error('down')) };
    const off: FeedCollector = { source: 'product_hunt', everyMs: 60_000, available: false, collect: async () => [item('p')] };

    const first = await collectDue(db.sql, [ok, broken, off], silentLog, { now: NOW });
    expect(first).toEqual([
      { source: 'show_hn', found: 1, added: 1 },
      { source: 'yc', found: 0, added: 0, error: 'down' },
    ]);
    // Ten minutes later only the broken one (one minute interval) is due again.
    const second = await collectDue(db.sql, [ok, broken, off], silentLog, { now: new Date(NOW.getTime() + 10 * 60_000) });
    expect(second.map((r) => r.source)).toEqual(['yc']);
    expect(calls).toBe(1);
    const [yc] = await db.sql<{ last_ok_at: Date | null; last_error: string }[]>`select last_ok_at, last_error from feed_sources where source = 'yc'`;
    expect(yc).toEqual({ last_ok_at: null, last_error: 'down' });
  });

  it('reaches back to the last good run, with overlap', async () => {
    const seen: Date[] = [];
    const c: FeedCollector = { source: 'show_hn', everyMs: 60_000, available: true, collect: async (ctx) => (seen.push(ctx.since), []) };
    await collectDue(db.sql, [c], silentLog, { now: NOW });
    await collectDue(db.sql, [c], silentLog, { now: new Date(NOW.getTime() + 60 * 60_000) });
    expect(seen[0]).toEqual(new Date(NOW.getTime() - 7 * DAY));
    expect(seen[1]).toEqual(new Date(NOW.getTime() - 2 * 60 * 60_000));
  });
});

describe('drops', () => {
  it('keeps a daily beat', () => {
    const at = new Date('2026-10-12T06:00:00Z');
    expect(nextRunAfter(at, new Date('2026-10-12T06:00:30Z'))).toEqual(new Date('2026-10-13T06:00:00Z'));
    // Missed three days while the worker was down: next is still 06:00, in the future.
    expect(nextRunAfter(at, new Date('2026-10-15T09:00:00Z'))).toEqual(new Date('2026-10-16T06:00:00Z'));
  });

  it('delivers fresh matching launches, newest first, up to the daily limit', async () => {
    await storeItems(
      db.sql,
      [
        item('old', { launchedAt: new Date(NOW.getTime() - 10 * DAY), name: 'AI old' }),
        item('ai1', { name: 'AI writer', launchedAt: new Date(NOW.getTime() - 2 * DAY) }),
        item('ai2', { tagline: 'An AI agent for invoices', launchedAt: new Date(NOW.getTime() - DAY) }),
        item('ai3', { tags: ['Artificial Intelligence', 'AI'], launchedAt: NOW }),
        item('crm', { name: 'Simple CRM' }),
        item('yc1', { source: 'yc', name: 'AI chips', launchedAt: undefined }),
      ],
      new Date(NOW.getTime() - 60_000),
    );
    const d = await drop({ keyword: 'ai', sources: ['show_hn'], dailyLimit: 2 });

    const results = await runDueDrops(db.sql, silentLog, NOW);
    expect(results).toEqual([{ dropId: d.id, outcome: 'delivered', searchId: expect.any(String) }]);
    const [search] = await dropSearches(d.id);
    expect(search).toMatchObject({ kind: 'drop', limit: 2, params: { dropId: d.id, dropName: 'AI tools', keyword: 'ai', sources: ['show_hn'], afterId: 0 } });
    const [job] = await db.sql`select type, payload from jobs where search_id = ${search!.id}`;
    expect(job).toMatchObject({ type: 'find', payload: { searchId: search!.id } });

    // Newest Show HN first; the YC one is another source and the old one is not fresh.
    expect(await deliver(search!.id)).toEqual(['ai3.io', 'ai2.io']);

    const [after] = await listDrops(db.sql, 'u1');
    expect(after).toMatchObject({ lastDeliveredAt: NOW.toISOString(), nextRunAt: new Date(NOW.getTime() + DAY).toISOString(), companiesDelivered: 2 });
  });

  it('creates no search when nothing is new, and only looks at new items next time', async () => {
    await storeItems(db.sql, [item('a')], NOW);
    const d = await drop();
    await runDueDrops(db.sql, silentLog, NOW);
    expect(await deliver((await dropSearches(d.id))[0]!.id)).toEqual(['a.io']);

    // Next day, nothing collected: no search.
    const day2 = new Date(NOW.getTime() + DAY);
    expect(await runDueDrops(db.sql, silentLog, day2)).toEqual([{ dropId: d.id, outcome: 'nothing_new' }]);
    expect(await dropSearches(d.id)).toHaveLength(1);

    // Day three: the same company relaunches on another source plus one new one.
    await storeItems(db.sql, [item('a2', { source: 'product_hunt', website: 'https://a.io/launch' }), item('b')], day2);
    await runDueDrops(db.sql, silentLog, new Date(NOW.getTime() + 2 * DAY));
    const searches = await dropSearches(d.id);
    expect(searches).toHaveLength(2);
    expect(searches[1]!.params.since).toBeUndefined();
    expect(await deliver(searches[1]!.id)).toEqual(['b.io']);
  });

  it('skips a run while the user has no allowance left', async () => {
    await storeItems(db.sql, [item('a')], NOW);
    const d = await drop();
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('u1', ${periodOf(NOW)}, 50)`;
    expect(await runDueDrops(db.sql, silentLog, NOW)).toEqual([{ dropId: d.id, outcome: 'quota_exceeded' }]);
    const [row] = await db.sql<{ cursor: string }[]>`select cursor from drops where id = ${d.id}`;
    // The launches wait for the next run.
    expect(Number(row!.cursor)).toBe(0);
  });

  it('leaves paused drops alone', async () => {
    await storeItems(db.sql, [item('a')], NOW);
    const d = await drop();
    await db.sql`update drops set enabled = false where id = ${d.id}`;
    expect(await runDueDrops(db.sql, silentLog, NOW)).toEqual([]);
  });
});
