// Retention for agent sign-up (docs/SPEC.md, "API and agents"). The worker
// runs it next to purge() in leads/retention.ts.

import type { Sql } from 'postgres';
import { UNCLAIMED_DELETE_DAYS } from '@nvoke/shared';

/** Sign-up attempts are kept this long for the rate limits, then deleted. */
export const AGENT_SIGNUP_LOG_DAYS = 30;

export interface AgentPurgeResult {
  unclaimedAccounts: number;
  signupLog: number;
}

/**
 * Deletes accounts an agent created that nobody claimed within
 * UNCLAIMED_DELETE_DAYS, with everything they own (on delete cascade), and
 * their Clerk users. A Clerk user that cannot be deleted keeps its row, so
 * the next run tries again.
 */
export async function purgeAgentSignups(
  sql: Sql,
  deleteClerkUser: ((userId: string) => Promise<void>) | null,
  now: Date = new Date(),
): Promise<AgentPurgeResult> {
  const at = now.toISOString();
  const stale = await sql<{ clerk_user_id: string }[]>`
    select clerk_user_id from accounts
    where claimed_at is null and created_at < ${at}::timestamptz - make_interval(days => ${UNCLAIMED_DELETE_DAYS})
    limit 500
  `;
  let unclaimedAccounts = 0;
  for (const { clerk_user_id: userId } of stale) {
    if (deleteClerkUser) {
      try {
        await deleteClerkUser(userId);
      } catch (err) {
        // Already gone in Clerk is fine; anything else waits for the next run.
        if ((err as { status?: number }).status !== 404) continue;
      }
    }
    const rows = await sql`delete from accounts where clerk_user_id = ${userId} and claimed_at is null returning clerk_user_id`;
    unclaimedAccounts += rows.length;
  }
  const log = await sql`
    delete from agent_signups
    where created_at < ${at}::timestamptz - make_interval(days => ${AGENT_SIGNUP_LOG_DAYS})
    returning id
  `;
  return { unclaimedAccounts, signupLog: log.length };
}
