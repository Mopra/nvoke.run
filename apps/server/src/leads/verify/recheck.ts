// A second look at settled unknowns. An address ends unknown when its
// server greylisted us past the pipeline's retries, would not take our
// connection, or every lane stayed throttled for two days. It was already
// paid for (found, crawled, scored), so a worker tick asks a few of them
// again hours later, while no search waits for verify slots. The verifier
// paces the sessions as it paces any other, and a cached verdict (another
// search checked the address since) costs none.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { emailWeight, type Verification } from '@nvoke/shared';
import { chargeVerified } from '../quota.js';
import { isCapacityDeferral, type Verifier } from './index.js';

/** Unknowns asked per tick at most. */
export const RECHECK_BATCH = 20;
/** Looks an unknown gets at most, the first RECHECK_FIRST_MS after it settled, each next one twice as late. */
export const RECHECK_MAX = 3;
export const RECHECK_FIRST_MS = 2 * 60 * 60_000;
/** Only unknowns found this recently: an older lead has been used or forgotten. */
export const RECHECK_WITHIN_MS = 7 * 24 * 60 * 60_000;

export interface RecheckDeps {
  sql: Sql;
  verifier: Pick<Verifier, 'verify'>;
  log?: Pick<Logger, 'info' | 'warn'>;
  now?: () => Date;
  signal?: AbortSignal;
  batch?: number;
}

export interface RecheckOutcome {
  /** Verify jobs are due, so the tick left the slots to them. */
  busy: boolean;
  asked: number;
  /** New verdicts, by verification. */
  settled: Partial<Record<Verification, number>>;
  stillUnknown: number;
  /** Valid, but the owner's allowance is spent: left unknown, uncharged. */
  overLimit: number;
  /** Stopped early because every lane was at its budget; the rest wait for the next tick. */
  paced: boolean;
}

/**
 * Asks up to `batch` recent unknowns again, newest first. A verdict is
 * recorded like the pipeline records one (a valid address is charged, in
 * the same transaction); an answer that is unknown again counts a look. A
 * check no lane could take now counts nothing and ends the tick.
 */
export async function recheckUnknown(deps: RecheckDeps): Promise<RecheckOutcome> {
  const { sql } = deps;
  const now = deps.now?.() ?? new Date();
  const out: RecheckOutcome = { busy: false, asked: 0, settled: {}, stillUnknown: 0, overLimit: 0, paced: false };

  // Live searches first: their checks need the same slots.
  const [due] = await sql`
    select 1 from jobs
    where type = 'verify' and status in ('queued', 'running') and run_after <= ${now.toISOString()}::timestamptz
    limit 1
  `;
  if (due) return { ...out, busy: true };

  const rows = await sql<{ id: string; address: string }[]>`
    select e.id::text, e.address from emails e
    join searches s on s.id = e.search_id
    where e.verification = 'unknown' and s.status <> 'canceled'
      and e.unknown_rechecks < ${RECHECK_MAX}
      and e.created_at > ${now.toISOString()}::timestamptz - make_interval(secs => ${RECHECK_WITHIN_MS / 1000})
      and coalesce(e.rechecked_at, e.checked_at, e.created_at)
        < ${now.toISOString()}::timestamptz - make_interval(secs => ${RECHECK_FIRST_MS / 1000} * power(2, e.unknown_rechecks))
    order by e.created_at desc
    limit ${deps.batch ?? RECHECK_BATCH}
  `;

  for (const row of rows) {
    if (deps.signal?.aborted) break;
    const result = await deps.verifier.verify(row.address, deps.signal);
    if (deps.signal?.aborted) break;
    if (isCapacityDeferral(result)) {
      out.paced = true;
      break;
    }
    out.asked++;
    const recorded = await recordRecheck(sql, row.id, result.verification, now);
    if (recorded === 'unknown') out.stillUnknown++;
    else if (recorded === 'over_limit') out.overLimit++;
    else if (recorded) out.settled[recorded] = (out.settled[recorded] ?? 0) + 1;
    if (recorded && recorded !== 'unknown') deps.log?.info({ emailId: row.id, verification: result.verification, reason: result.reason }, 'recheck: settled');
  }
  return out;
}

/**
 * Records one look under the email's lock: a verdict (charging a valid one),
 * or one more look at an unknown. Null when the row is no longer unknown.
 */
async function recordRecheck(
  sql: Sql,
  emailId: string,
  verification: Verification,
  now: Date,
): Promise<Verification | 'over_limit' | null> {
  return sql.begin(async (tx) => {
    const [email] = await tx<{ clerk_user_id: string; address: string; search_id: string; kind: string }[]>`
      select e.clerk_user_id, e.address, e.search_id, s.kind from emails e
      join searches s on s.id = e.search_id
      where e.id = ${emailId} and e.verification = 'unknown'
      for update of e
    `;
    if (!email) return null;
    const look = () => tx`
      update emails set unknown_rechecks = unknown_rechecks + 1, rechecked_at = ${now.toISOString()}::timestamptz
      where id = ${emailId}
    `;
    if (verification === 'unknown') {
      await look();
      return 'unknown';
    }
    if (verification === 'valid') {
      const charge = await chargeVerified(tx, email.clerk_user_id, email.address, now, emailWeight(email.kind));
      if (charge === 'over_limit') {
        await look();
        return 'over_limit';
      }
      await tx`update searches set emails_valid = emails_valid + 1 where id = ${email.search_id}`;
    }
    await tx`
      update emails set verification = ${verification}, checked_at = ${now.toISOString()}::timestamptz,
        unknown_rechecks = unknown_rechecks + 1, rechecked_at = ${now.toISOString()}::timestamptz
      where id = ${emailId}
    `;
    return verification;
  });
}
