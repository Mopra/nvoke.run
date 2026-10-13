// Accounts, monthly usage and the verified email quota.
//
// The meter counts verified emails: addresses whose check came back valid.
// Each address is charged once per user per 12 months (billed_emails, see retention.ts), and
// the usage row is locked while charging, so concurrent verifications of the
// same user never overshoot the plan's allowance.

import type { Sql, TransactionSql } from 'postgres';
import type { AccountSummary, Plan } from '@nvoke/shared';
import { MAX_SEARCH_LIMIT, asPlan, emailsPerMonth, periodOf } from './plans.js';

type Db = Sql | TransactionSql;

/** Creates the account on first sight and returns its plan. */
export async function ensureAccount(sql: Db, userId: string): Promise<Plan> {
  const rows = await sql<{ plan: string }[]>`
    with ins as (
      insert into accounts (clerk_user_id) values (${userId})
      on conflict (clerk_user_id) do nothing
      returning plan
    )
    select plan from ins
    union all
    select plan from accounts where clerk_user_id = ${userId}
    limit 1
  `;
  return asPlan(rows[0]?.plan);
}

export async function planOf(sql: Db, userId: string): Promise<Plan> {
  const rows = await sql<{ plan: string }[]>`select plan from accounts where clerk_user_id = ${userId}`;
  return asPlan(rows[0]?.plan);
}

export async function emailsVerified(sql: Db, userId: string, period: string = periodOf()): Promise<number> {
  const rows = await sql<{ emails_verified: number }[]>`
    select emails_verified from usage where clerk_user_id = ${userId} and period = ${period}
  `;
  return rows[0]?.emails_verified ?? 0;
}

export async function accountSummary(sql: Db, userId: string, now: Date = new Date()): Promise<AccountSummary> {
  const plan = await ensureAccount(sql, userId);
  const period = periodOf(now);
  const [origin] = await sql<{ created_by: 'human' | 'agent'; agent_name: string | null; claimed_at: Date | null }[]>`
    select created_by, agent_name, claimed_at from accounts where clerk_user_id = ${userId}
  `;
  return {
    userId,
    plan,
    usage: { period, emailsVerified: await emailsVerified(sql, userId, period), emailsLimit: emailsPerMonth(plan) },
    maxSearchLimit: MAX_SEARCH_LIMIT,
    account: {
      createdBy: origin?.created_by ?? 'human',
      agentName: origin?.agent_name ?? null,
      claimedAt: origin?.claimed_at?.toISOString() ?? null,
    },
  };
}

/**
 * `charged`: counted against this period. `already_billed`: the user paid for
 * this address before, so it is free. `over_limit`: no allowance left; the
 * caller must not hand the address over.
 */
export type Charge = 'charged' | 'already_billed' | 'over_limit';

/**
 * Charges one verified address. Must run inside a transaction: it locks the
 * user's usage row for this period until the transaction ends.
 */
export async function chargeVerified(tx: TransactionSql, userId: string, address: string, now: Date = new Date()): Promise<Charge> {
  const period = periodOf(now);
  await tx`
    insert into usage (clerk_user_id, period) values (${userId}, ${period})
    on conflict (clerk_user_id, period) do nothing
  `;
  const [row] = await tx<{ emails_verified: number; plan: string }[]>`
    select u.emails_verified, a.plan
    from usage u join accounts a on a.clerk_user_id = u.clerk_user_id
    where u.clerk_user_id = ${userId} and u.period = ${period}
    for update of u
  `;
  const billed = await tx`select 1 from billed_emails where clerk_user_id = ${userId} and address = ${address}`;
  if (billed.length > 0) return 'already_billed';
  if ((row?.emails_verified ?? 0) >= emailsPerMonth(row?.plan ?? '')) return 'over_limit';
  await tx`insert into billed_emails (clerk_user_id, address, period) values (${userId}, ${address}, ${period})`;
  await tx`
    update usage set emails_verified = emails_verified + 1
    where clerk_user_id = ${userId} and period = ${period}
  `;
  return 'charged';
}

/** True when the user has no verified emails left this period. */
export async function quotaExhausted(sql: Db, userId: string, now: Date = new Date()): Promise<boolean> {
  const plan = await planOf(sql, userId);
  return (await emailsVerified(sql, userId, periodOf(now))) >= emailsPerMonth(plan);
}
