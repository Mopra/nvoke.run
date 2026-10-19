// Drops (docs/SPEC.md, "Drops"): saved filters over the feed. Once a day an
// enabled drop with new matching launches becomes a search of kind 'drop',
// which the normal pipeline crawls, verifies and bills. A run that finds
// nothing new creates no search.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import {
  DROP_BACKFILL_DAYS,
  DROP_DAILY_LIMIT_DEFAULT,
  DropRunParams,
  FEED_SOURCES,
  type CreateDropRequest,
  type Drop,
  type FeedSource,
  type FeedSourceStatus,
  type UpdateDropRequest,
} from '@nvoke/shared';
import { maxDropDailyLimit } from '../leads/plans.js';
import { planOf, quotaExhausted } from '../leads/quota.js';
import type { FoundCompany, SourceAdapter } from '../leads/sources/types.js';
import { enqueue } from '../worker/queue.js';

type Db = Sql | TransactionSql;

const DAY_MS = 86_400_000;
/** Most drops one user may keep. */
export const MAX_DROPS_PER_USER = 20;

/** What a drop search stores in params: the public part plus the slice of the feed it covers. */
export const DropRunInternal = DropRunParams.extend({
  /** Feed items after this id... */
  afterId: z.number().int().nonnegative(),
  /** ...up to and including this one. */
  untilId: z.number().int().nonnegative(),
  /** First run only: launches older than this are not fresh. */
  since: z.iso.datetime({ offset: true }).optional(),
});
export type DropRunInternal = z.infer<typeof DropRunInternal>;

interface DropRow {
  id: string;
  clerk_user_id: string;
  name: string;
  keyword: string | null;
  sources: FeedSource[];
  daily_limit: number;
  enabled: boolean;
  cursor: string | number;
  next_run_at: Date;
  last_delivered_at: Date | null;
  created_at: Date;
  companies_delivered?: number;
}

function toDrop(r: DropRow): Drop {
  return {
    id: r.id,
    name: r.name,
    keyword: r.keyword,
    sources: r.sources,
    dailyLimit: r.daily_limit,
    enabled: r.enabled,
    nextRunAt: r.next_run_at.toISOString(),
    lastDeliveredAt: r.last_delivered_at?.toISOString() ?? null,
    companiesDelivered: r.companies_delivered ?? 0,
    createdAt: r.created_at.toISOString(),
  };
}

const DROP_COLUMNS = `d.id, d.clerk_user_id, d.name, d.keyword, d.sources, d.daily_limit, d.enabled, d.cursor,
  d.next_run_at, d.last_delivered_at, d.created_at,
  (select count(*)::int from companies c join searches s on s.id = c.search_id where s.drop_id = d.id) as companies_delivered`;

const words = (keyword: string | null | undefined): string[] => (keyword ?? '').toLowerCase().split(/\s+/).filter(Boolean);

// The feed slice a run covers

export interface FeedItemRow {
  id: string;
  source: FeedSource;
  source_ref: string;
  name: string;
  website: string;
  domain: string;
  tagline: string | null;
  location: string | null;
}

export interface CandidateQuery {
  dropId: string;
  keyword?: string | null;
  sources: FeedSource[];
  afterId: number;
  untilId: number;
  since?: Date | null;
  limit: number;
}

/**
 * Feed items a run may deliver, newest first, one per domain: inside the id
 * range, from the drop's sources, matching every keyword word, and on a
 * domain this drop has not delivered before.
 */
export async function candidates(sql: Db, q: CandidateQuery): Promise<FeedItemRow[]> {
  const since = q.since ? q.since.toISOString() : null;
  return sql<FeedItemRow[]>`
    select id, source, source_ref, name, website, domain, tagline, location from (
      select distinct on (f.domain) f.*, coalesce(f.launched_at, f.discovered_at) as fresh_at
      from feed_items f
      where f.id > ${q.afterId} and f.id <= ${q.untilId}
        and f.source = any(${q.sources}::text[])
        and (${since}::timestamptz is null or coalesce(f.launched_at, f.discovered_at) >= ${since}::timestamptz)
        and not exists (select 1 from unnest(${words(q.keyword)}::text[]) w where position(w in f.search_text) = 0)
        and not exists (
          select 1 from companies c join searches s on s.id = c.search_id
          where s.drop_id = ${q.dropId} and c.domain = f.domain
        )
      order by f.domain, fresh_at desc, f.id desc
    ) x
    order by fresh_at desc, id desc
    limit ${q.limit}
  `;
}

/** The find step of a drop search: reads its slice of the feed instead of calling a source. */
export function dropAdapter(getSql: () => Sql): SourceAdapter<DropRunInternal> {
  return {
    kind: 'drop',
    async *find(params, ctx) {
      // Some candidates fall out in the find step (suppressed domains), so ask for a few more.
      const rows = await candidates(getSql(), {
        dropId: params.dropId,
        keyword: params.keyword,
        sources: params.sources,
        afterId: params.afterId,
        untilId: params.untilId,
        since: params.since ? new Date(params.since) : null,
        limit: ctx.limit + 50,
      });
      for (const r of rows) {
        const company: FoundCompany = {
          name: r.name,
          website: r.website,
          source: r.source,
          sourceRef: r.source_ref,
          location: r.location ?? undefined,
          category: r.tagline ?? undefined,
        };
        yield company;
      }
    },
  };
}

// Scheduling

/** The first run time after `now` on the drop's daily beat. */
export function nextRunAfter(nextRunAt: Date, now: Date): Date {
  let next = nextRunAt.getTime() + DAY_MS;
  if (next <= now.getTime()) next += Math.ceil((now.getTime() - next) / DAY_MS) * DAY_MS;
  if (next <= now.getTime()) next += DAY_MS;
  return new Date(next);
}

export interface DropRunResult {
  dropId: string;
  outcome: 'delivered' | 'nothing_new' | 'quota_exceeded';
  searchId?: string;
}

/**
 * Runs every enabled drop whose time has come. Safe from many workers at
 * once: due drops are locked with SKIP LOCKED for the length of the run.
 */
export async function runDueDrops(sql: Sql, log: Logger, now: Date = new Date()): Promise<DropRunResult[]> {
  return sql.begin(async (tx) => {
    const due = await tx<DropRow[]>`
      select d.id, d.clerk_user_id, d.name, d.keyword, d.sources, d.daily_limit, d.enabled, d.cursor,
        d.next_run_at, d.last_delivered_at, d.created_at
      from drops d
      where d.enabled and d.next_run_at <= ${now}
      order by d.next_run_at
      limit 50
      for update skip locked
    `;
    if (due.length === 0) return [];
    const [top] = await tx<{ id: string }[]>`select coalesce(max(id), 0) as id from feed_items`;
    const untilId = Number(top?.id ?? 0);
    const results: DropRunResult[] = [];
    for (const drop of due) {
      const next = nextRunAfter(drop.next_run_at, now);
      const cursor = Number(drop.cursor);
      // Nothing can be delivered, and the launches are not stale yet: try again tomorrow.
      if (await quotaExhausted(tx, drop.clerk_user_id, now)) {
        await tx`update drops set next_run_at = ${next} where id = ${drop.id}`;
        results.push({ dropId: drop.id, outcome: 'quota_exceeded' });
        continue;
      }
      const since = cursor === 0 ? new Date(now.getTime() - DROP_BACKFILL_DAYS * DAY_MS) : null;
      const query = { dropId: drop.id, keyword: drop.keyword, sources: drop.sources, afterId: cursor, untilId, since, limit: 1 };
      const any = await candidates(tx, query);
      if (any.length === 0) {
        await tx`update drops set cursor = ${untilId}, next_run_at = ${next} where id = ${drop.id}`;
        results.push({ dropId: drop.id, outcome: 'nothing_new' });
        continue;
      }
      const params: DropRunInternal = {
        dropId: drop.id,
        dropName: drop.name,
        ...(drop.keyword ? { keyword: drop.keyword } : {}),
        sources: drop.sources,
        afterId: cursor,
        untilId,
        ...(since ? { since: since.toISOString() } : {}),
      };
      // A drop made on a bigger plan delivers what the current plan allows.
      const limit = Math.min(drop.daily_limit, maxDropDailyLimit(await planOf(tx, drop.clerk_user_id)));
      const [search] = await tx<{ id: string }[]>`
        insert into searches (clerk_user_id, kind, params, "limit", drop_id)
        values (${drop.clerk_user_id}, 'drop', ${tx.json(params)}, ${limit}, ${drop.id})
        returning id
      `;
      await enqueue(tx, { type: 'find', payload: { searchId: search!.id }, searchId: search!.id });
      await tx`
        update drops set cursor = ${untilId}, next_run_at = ${next}, last_delivered_at = ${now}
        where id = ${drop.id}
      `;
      results.push({ dropId: drop.id, outcome: 'delivered', searchId: search!.id });
    }
    log.info({ results }, 'drops: ran due drops');
    return results;
  });
}

// CRUD behind /v1/drops. Every query is scoped by clerk_user_id.

export async function listDrops(sql: Sql, userId: string): Promise<Drop[]> {
  const rows = await sql<DropRow[]>`
    select ${sql.unsafe(DROP_COLUMNS)} from drops d
    where d.clerk_user_id = ${userId}
    order by d.created_at desc, d.id desc
  `;
  return rows.map(toDrop);
}

export async function getDrop(sql: Db, userId: string, id: string): Promise<Drop | null> {
  const [row] = await sql<DropRow[]>`
    select ${sql.unsafe(DROP_COLUMNS)} from drops d where d.id = ${id} and d.clerk_user_id = ${userId}
  `;
  return row ? toDrop(row) : null;
}

export async function countDrops(sql: Sql, userId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from drops where clerk_user_id = ${userId}`;
  return row?.n ?? 0;
}

/** The first run happens within a minute, reaching back DROP_BACKFILL_DAYS. */
export async function createDrop(sql: Sql, userId: string, req: CreateDropRequest): Promise<Drop> {
  const [row] = await sql<{ id: string }[]>`
    insert into drops (clerk_user_id, name, keyword, sources, daily_limit)
    values (${userId}, ${req.name}, ${req.keyword ?? null}, ${req.sources ?? FEED_SOURCES}::text[], ${req.dailyLimit ?? DROP_DAILY_LIMIT_DEFAULT})
    returning id
  `;
  return (await getDrop(sql, userId, row!.id))!;
}

export async function updateDrop(sql: Sql, userId: string, id: string, req: UpdateDropRequest): Promise<Drop | null> {
  const set: Record<string, unknown> = {};
  if (req.name !== undefined) set.name = req.name;
  if (req.keyword !== undefined) set.keyword = req.keyword;
  if (req.sources !== undefined) set.sources = req.sources;
  if (req.dailyLimit !== undefined) set.daily_limit = req.dailyLimit;
  if (req.enabled !== undefined) set.enabled = req.enabled;
  const rows = await sql`
    update drops set ${sql(set)} where id = ${id} and clerk_user_id = ${userId} returning id
  `;
  return rows.length > 0 ? getDrop(sql, userId, id) : null;
}

/** Its searches stay, as ordinary searches. */
export async function deleteDrop(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from drops where id = ${id} and clerk_user_id = ${userId} returning id`;
  return rows.length > 0;
}

/** Moves the next run to now, so the worker runs it within a minute. */
export async function runDropNow(sql: Sql, userId: string, id: string, now: Date = new Date()): Promise<Drop | null> {
  const rows = await sql`
    update drops set next_run_at = ${now}, enabled = true where id = ${id} and clerk_user_id = ${userId} returning id
  `;
  return rows.length > 0 ? getDrop(sql, userId, id) : null;
}

/** Per source: whether it is collected, and how much it brought in over the last week. */
export async function feedSourceStatus(
  sql: Sql,
  available: Record<FeedSource, boolean>,
  now: Date = new Date(),
): Promise<FeedSourceStatus[]> {
  const counts = await sql<{ source: FeedSource; n: number }[]>`
    select source, count(*)::int as n from feed_items
    where discovered_at > ${new Date(now.getTime() - 7 * DAY_MS)}
    group by source
  `;
  const runs = await sql<{ source: FeedSource; last_ok_at: Date | null }[]>`select source, last_ok_at from feed_sources`;
  return FEED_SOURCES.map((source) => ({
    source,
    available: available[source],
    lastWeek: counts.find((c) => c.source === source)?.n ?? 0,
    lastCollectedAt: runs.find((r) => r.source === source)?.last_ok_at?.toISOString() ?? null,
  }));
}
