// Accounts, monthly usage and the email quota.
//
// Quota is counted in emails stored, per user and calendar month (UTC). The
// usage row is locked while emails are inserted, so concurrent crawls of the
// same user can never overshoot the plan limit.

import type { Sql, TransactionSql } from 'postgres';
import type { AccountSummary, Plan } from '@nvoke/shared';
import { PLANS, periodOf } from './plans.js';

type Db = Sql | TransactionSql;

/** Creates the account on first sight and returns its plan. */
export async function ensureAccount(sql: Db, userId: string): Promise<Plan> {
  const rows = await sql<{ plan: Plan }[]>`
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
  return rows[0]?.plan ?? 'free';
}

export async function planOf(sql: Db, userId: string): Promise<Plan> {
  const rows = await sql<{ plan: Plan }[]>`select plan from accounts where clerk_user_id = ${userId}`;
  return rows[0]?.plan ?? 'free';
}

export async function emailsUsed(sql: Db, userId: string, period: string = periodOf()): Promise<number> {
  const rows = await sql<{ emails_found: number }[]>`
    select emails_found from usage where clerk_user_id = ${userId} and period = ${period}
  `;
  return rows[0]?.emails_found ?? 0;
}

export async function accountSummary(sql: Db, userId: string, now: Date = new Date()): Promise<AccountSummary> {
  const plan = await ensureAccount(sql, userId);
  const period = periodOf(now);
  const used = await emailsUsed(sql, userId, period);
  return {
    userId,
    plan,
    usage: { period, emailsFound: used, emailsLimit: PLANS[plan].emailsPerMonth },
    maxSearchLimit: PLANS[plan].maxSearchLimit,
  };
}

export interface Reservation {
  /** How many of the wanted emails may be stored. */
  granted: number;
  /** True when fewer than wanted were granted. */
  exceeded: boolean;
}

/**
 * Locks the user's usage row for this period and returns how many emails may
 * still be stored. Must run inside a transaction; call `commitUsage` in the
 * same transaction with the number actually stored.
 */
export async function reserveEmails(tx: TransactionSql, userId: string, wanted: number, now: Date = new Date()): Promise<Reservation> {
  const period = periodOf(now);
  await tx`
    insert into usage (clerk_user_id, period) values (${userId}, ${period})
    on conflict (clerk_user_id, period) do nothing
  `;
  const [row] = await tx<{ emails_found: number; plan: Plan }[]>`
    select u.emails_found, a.plan
    from usage u join accounts a on a.clerk_user_id = u.clerk_user_id
    where u.clerk_user_id = ${userId} and u.period = ${period}
    for update of u
  `;
  const limit = PLANS[row?.plan ?? 'free'].emailsPerMonth;
  const remaining = Math.max(0, limit - (row?.emails_found ?? 0));
  const granted = Math.min(wanted, remaining);
  return { granted, exceeded: wanted > granted };
}

export async function commitUsage(tx: TransactionSql, userId: string, stored: number, now: Date = new Date()): Promise<void> {
  if (stored <= 0) return;
  await tx`
    update usage set emails_found = emails_found + ${stored}
    where clerk_user_id = ${userId} and period = ${periodOf(now)}
  `;
}

/** True when the user has no emails left this period. */
export async function quotaExhausted(sql: Db, userId: string, now: Date = new Date()): Promise<boolean> {
  const plan = await planOf(sql, userId);
  return (await emailsUsed(sql, userId, periodOf(now))) >= PLANS[plan].emailsPerMonth;
}
