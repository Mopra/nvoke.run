// Paused sources (migration 0500_alerts). A paid source that refuses us
// (spend limit reached, billing problem, revoked key) is paused for a short
// while: new searches of its kind are refused with a clear error instead of
// failing one by one. When the pause runs out, the next search tries again.

import type { Sql } from 'postgres';
import { itemDomain, type CreateSearchRequest, type SearchKind } from '@nvoke/shared';
import { FREE_SEARCH_SOURCE, freeSearchMode, type FreeSearchMode } from './sources/free-search.js';

/** How long a refusal pauses its source before the next search tries again. */
export const SOURCE_PAUSE_MS = 10 * 60_000;

/** The source behind each search kind that can be paused. */
export const PAUSABLE_SOURCE: Partial<Record<SearchKind, string>> = { web: 'brave', domains: 'brave', icp: 'brave' };

/** False for a search that never calls its kind's source: a list of only domains. */
export function requestNeedsSource(req: CreateSearchRequest): boolean {
  if (req.kind === 'domains') return req.params.items.some((item) => itemDomain(item) === null);
  return true;
}

export async function pauseSource(sql: Sql, source: string, reason: string, now: Date = new Date(), forMs = SOURCE_PAUSE_MS): Promise<void> {
  const until = new Date(now.getTime() + forMs).toISOString();
  await sql`
    insert into source_pauses (source, reason, paused_at, until)
    values (${source}, ${reason.slice(0, 500)}, ${now.toISOString()}, ${until})
    on conflict (source) do update set reason = excluded.reason, paused_at = excluded.paused_at, until = excluded.until
  `;
}

/**
 * Whether searches of this kind are paused right now. `needsSource` false
 * skips the check. A paused Brave pauses web searches only when the free
 * search (FREE_SEARCH) is off or paused too, since it answers in Brave's place.
 */
export async function kindPaused(
  sql: Sql,
  kind: SearchKind,
  needsSource = true,
  now: Date = new Date(),
  freeSearch: FreeSearchMode = freeSearchMode(),
): Promise<boolean> {
  const source = PAUSABLE_SOURCE[kind];
  if (!source || !needsSource) return false;
  const sources = source === 'brave' && freeSearch !== 'off' ? [source, FREE_SEARCH_SOURCE] : [source];
  const rows = await sql`select 1 from source_pauses where source in ${sql(sources)} and until > ${now.toISOString()}::timestamptz`;
  return rows.length === sources.length;
}

/** Ends a pause early, after the operator fixed the cause. */
export async function resumeSource(sql: Sql, source: string): Promise<boolean> {
  const rows = await sql`delete from source_pauses where source = ${source} returning source`;
  return rows.length > 0;
}
