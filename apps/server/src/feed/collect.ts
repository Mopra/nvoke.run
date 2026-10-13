// Runs the feed collectors that are due and stores what they find in
// feed_items. The worker calls collectDue() every minute; feed_sources
// remembers when each collector last ran, so restarts do not refetch.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { DROP_BACKFILL_DAYS } from '@nvoke/shared';
import { isPlatformDomain, normalizeDomain, normalizeWebsite } from '../leads/domain.js';
import type { FeedCollector, FeedItemInput } from './collectors.js';

/** A run reaches back this far before the last good run, so a late index update is not missed. */
const OVERLAP_MS = 2 * 60 * 60_000;
/** Wall clock limit for one collector run. */
const COLLECT_TIMEOUT_MS = 5 * 60_000;
/** Only one worker collects at a time. */
const COLLECT_LOCK = 7_004_201;

export interface CollectResult {
  source: string;
  found: number;
  added: number;
  error?: string;
}

interface SourceRow {
  source: string;
  last_run_at: Date;
  last_ok_at: Date | null;
}

/** The text a drop keyword is matched against. */
export function searchText(item: FeedItemInput): string {
  return [item.name, item.tagline, item.description, ...(item.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Inserts new items and returns how many were new. Items without a usable company site are skipped. */
export async function storeItems(sql: Sql, items: FeedItemInput[], now: Date = new Date()): Promise<number> {
  const rows = [];
  for (const item of items) {
    const website = normalizeWebsite(item.website);
    const domain = website ? normalizeDomain(website) : null;
    if (!website || !domain || isPlatformDomain(domain)) continue;
    rows.push({
      source: item.source,
      source_ref: item.sourceRef.slice(0, 200),
      name: item.name.slice(0, 300),
      website,
      domain,
      tagline: item.tagline?.slice(0, 300) ?? null,
      description: item.description ?? null,
      tags: (item.tags ?? []).map((t) => t.slice(0, 80)).slice(0, 30),
      location: item.location?.slice(0, 300) ?? null,
      launched_at: item.launchedAt ?? null,
      discovered_at: now,
      search_text: searchText(item).slice(0, 4_000),
    });
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const inserted = await sql`
      insert into feed_items ${sql(chunk)}
      on conflict (source, source_ref) do nothing
      returning id
    `;
    added += inserted.length;
  }
  return added;
}

async function runOne(sql: Sql, collector: FeedCollector, row: SourceRow | undefined, now: Date, log: Logger): Promise<CollectResult> {
  const since = row?.last_ok_at
    ? new Date(row.last_ok_at.getTime() - OVERLAP_MS)
    : new Date(now.getTime() - DROP_BACKFILL_DAYS * 86_400_000);
  let result: CollectResult;
  try {
    const items = await collector.collect({ since, now, signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS), log });
    const added = await storeItems(sql, items, now);
    result = { source: collector.source, found: items.length, added };
  } catch (err) {
    result = { source: collector.source, found: 0, added: 0, error: err instanceof Error ? err.message : String(err) };
  }
  await sql`
    insert into feed_sources (source, last_run_at, last_ok_at, last_error, last_found, last_added)
    values (${collector.source}, ${now}, ${result.error ? null : now}, ${result.error?.slice(0, 500) ?? null}, ${result.found}, ${result.added})
    on conflict (source) do update set
      last_run_at = excluded.last_run_at,
      last_ok_at = coalesce(excluded.last_ok_at, feed_sources.last_ok_at),
      last_error = excluded.last_error,
      last_found = excluded.last_found,
      last_added = excluded.last_added
  `;
  if (result.error) log.warn(result, 'feed: collector failed');
  else log.info(result, 'feed: collected');
  return result;
}

/**
 * Runs every available collector whose interval has passed. A failing
 * collector is recorded and retried at its next interval; it never stops the
 * others. Returns nothing when another worker holds the lock.
 */
export async function collectDue(
  sql: Sql,
  collectors: FeedCollector[],
  log: Logger,
  opts: { now?: Date; force?: boolean } = {},
): Promise<CollectResult[]> {
  const reserved = await sql.reserve();
  try {
    const [lock] = await reserved<{ ok: boolean }[]>`select pg_try_advisory_lock(${COLLECT_LOCK}) as ok`;
    if (!lock?.ok) return [];
    try {
      const rows = await sql<SourceRow[]>`select source, last_run_at, last_ok_at from feed_sources`;
      const bySource = new Map(rows.map((r) => [r.source, r]));
      const results: CollectResult[] = [];
      for (const collector of collectors) {
        if (!collector.available) continue;
        const now = opts.now ?? new Date();
        const row = bySource.get(collector.source);
        if (!opts.force && row && row.last_run_at.getTime() + collector.everyMs > now.getTime()) continue;
        results.push(await runOne(sql, collector, row, now, log));
      }
      return results;
    } finally {
      await reserved`select pg_advisory_unlock(${COLLECT_LOCK})`;
    }
  } finally {
    reserved.release();
  }
}
