// The account behind an authenticated user: created on the first
// authenticated request, then read for plan and usage by GET /v1/me. The plan
// is kept in step with Clerk Billing: re-read when it is older than a few
// minutes, on demand (GET /v1/me?sync=1) and from the billing webhook.

import type { Sql } from 'postgres';
import { FREE_PLAN, type AccountSummary } from '@nvoke/shared';
import { revokeAgentKeys } from '../auth/api-keys.js';
import type { PlanSource } from '../billing/clerk.js';
import { accountSummary, ensureAccount } from './quota.js';

/** How long a plan read from Clerk is trusted before /v1/me reads it again. */
export const PLAN_SYNC_AFTER_MS = 5 * 60 * 1000;

interface Log {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface Accounts {
  /** Creates the accounts row if this user has none yet. */
  ensure(userId: string): Promise<void>;
  /** Plan and usage for this period. `sync` re-reads the plan from Clerk first. */
  summary(userId: string, opts?: { sync?: boolean }): Promise<AccountSummary>;
  /** Re-reads the plan from Clerk now. Does nothing for users without an account. */
  syncPlan(userId: string): Promise<void>;
  /**
   * A person signed in (site or desktop), which proves they own the email.
   * Claims an account an agent created and revokes the agent's sign-up key,
   * so an agent that signed up with someone else's address loses access the
   * moment the real owner shows up. The claim page claims explicitly instead.
   */
  humanSignedIn(userId: string): Promise<void>;
}

/** Claims an agent-created account. Returns how many agent keys were revoked, or null when it was already claimed. */
export async function claimAccount(sql: Sql, userId: string, opts: { keepAgentKeys: boolean }): Promise<number | null> {
  return sql.begin(async (tx) => {
    const rows = await tx`
      update accounts set claimed_at = now()
      where clerk_user_id = ${userId} and claimed_at is null
      returning clerk_user_id
    `;
    if (rows.length === 0) return null;
    return opts.keepAgentKeys ? 0 : revokeAgentKeys(tx, userId);
  });
}

/**
 * Postgres backed accounts. Remembers which users already have a row, so
 * ensure() costs one query per user per process, not one per request.
 */
export function postgresAccounts(getSql: () => Sql, plans: PlanSource | null = null, log?: Log): Accounts {
  const known = new Set<string>();
  const claimed = new Set<string>();

  async function sync(userId: string, force: boolean): Promise<void> {
    if (!plans) return;
    const sql = getSql();
    const [row] = await sql<{ plan: string; plan_synced_at: Date | null }[]>`
      select plan, plan_synced_at from accounts where clerk_user_id = ${userId}
    `;
    if (!row) return;
    if (!force && row.plan_synced_at && Date.now() - row.plan_synced_at.getTime() < PLAN_SYNC_AFTER_MS) return;
    try {
      const resolved = await plans.planOf(userId);
      let plan = resolved.plan;
      if (resolved.unknownSlugs.length > 0) {
        // The Clerk dashboard and the catalog disagree. That is our mistake,
        // never a reason to drop a paying user to Free.
        log?.error(
          { userId, slugs: resolved.unknownSlugs, kept: row.plan },
          'clerk reported plan slugs missing from packages/shared/src/plans.ts; fix the slug in the Clerk dashboard',
        );
        if (plan === FREE_PLAN) plan = row.plan as typeof plan;
      }
      await sql`update accounts set plan = ${plan}, plan_synced_at = now() where clerk_user_id = ${userId}`;
    } catch (err) {
      // Keep the plan on record; the next request tries again.
      log?.warn({ err, userId }, 'clerk billing lookup failed');
    }
  }

  return {
    async ensure(userId) {
      if (known.has(userId)) return;
      await ensureAccount(getSql(), userId);
      if (known.size > 50_000) known.clear();
      known.add(userId);
    },
    async summary(userId, opts) {
      await ensureAccount(getSql(), userId);
      await sync(userId, opts?.sync ?? false);
      return accountSummary(getSql(), userId);
    },
    syncPlan: (userId) => sync(userId, true),
    async humanSignedIn(userId) {
      if (claimed.has(userId)) return;
      const revoked = await claimAccount(getSql(), userId, { keepAgentKeys: false });
      if (revoked !== null) log?.warn({ userId, revoked }, 'agent account claimed by signing in; agent keys revoked');
      if (claimed.size > 50_000) claimed.clear();
      claimed.add(userId);
    },
  };
}
