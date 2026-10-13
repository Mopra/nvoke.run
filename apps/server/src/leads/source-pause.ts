// Paused sources (migration 0500_alerts). A paid source that refuses us
// (spend limit reached, billing problem, revoked key) is paused for a short
// while: new searches of its kind are refused with a clear error instead of
// failing one by one. When the pause runs out, the next search tries again.

import type { Sql } from 'postgres';
import type { SearchKind } from '@nvoke/shared';

/** How long a refusal pauses its source before the next search tries again. */
export const SOURCE_PAUSE_MS = 10 * 60_000;

/** The source behind each search kind that can be paused. */
export const PAUSABLE_SOURCE: Partial<Record<SearchKind, string>> = { web: 'brave' };

export async function pauseSource(sql: Sql, source: string, reason: string, now: Date = new Date()): Promise<void> {
  const until = new Date(now.getTime() + SOURCE_PAUSE_MS).toISOString();
  await sql`
    insert into source_pauses (source, reason, paused_at, until)
    values (${source}, ${reason.slice(0, 500)}, ${now.toISOString()}, ${until})
    on conflict (source) do update set reason = excluded.reason, paused_at = excluded.paused_at, until = excluded.until
  `;
}

/** Whether searches of this kind are paused right now. */
export async function kindPaused(sql: Sql, kind: SearchKind, now: Date = new Date()): Promise<boolean> {
  const source = PAUSABLE_SOURCE[kind];
  if (!source) return false;
  const rows = await sql`select 1 from source_pauses where source = ${source} and until > ${now.toISOString()}::timestamptz`;
  return rows.length > 0;
}

/** Ends a pause early, after the operator fixed the cause. */
export async function resumeSource(sql: Sql, source: string): Promise<boolean> {
  const rows = await sql`delete from source_pauses where source = ${source} returning source`;
  return rows.length > 0;
}
