// Accounts, monthly usage and the verified email quota.
//
// The meter counts verified emails: addresses whose check came back valid.
// An address found by a Sonar (`icp`) search counts as three
// (`emailWeight` in @nvoke/shared/plans), every other one as one.
// Each address is charged once per user per 12 months (billed_emails, see retention.ts), and
// the usage row is locked while charging, so concurrent verifications of the
// same user never overshoot the plan's allowance.

import type { Sql, TransactionSql } from 'postgres';
import { ICP_EMAIL_WEIGHT, type AccountSummary, type Plan } from '@nvoke/shared';
import { asPlan, emailsPerMonth, maxDropDailyLimit, maxSearchLimit, periodOf } from './plans.js';

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
    maxSearchLimit: maxSearchLimit(plan),
    maxDropDailyLimit: maxDropDailyLimit(plan),
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
 * Charges one verified address, `weight` emails of the allowance. Must run
 * inside a transaction: it locks the user's usage row for this period until
 * the transaction ends.
 */
export async function chargeVerified(
  tx: TransactionSql,
  userId: string,
  address: string,
  now: Date = new Date(),
  weight = 1,
): Promise<Charge> {
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
  if ((row?.emails_verified ?? 0) + weight > emailsPerMonth(row?.plan ?? '')) return 'over_limit';
  await tx`insert into billed_emails (clerk_user_id, address, period) values (${userId}, ${address}, ${period})`;
  await tx`
    update usage set emails_verified = emails_verified + ${weight}
    where clerk_user_id = ${userId} and period = ${period}
  `;
  return 'charged';
}

/** True when the user has no verified emails left this period. */
export async function quotaExhausted(sql: Db, userId: string, now: Date = new Date()): Promise<boolean> {
  const plan = await planOf(sql, userId);
  return (await emailsVerified(sql, userId, periodOf(now))) >= emailsPerMonth(plan);
}

/**
 * What a Sonar (`icp`) search may still be billed for, and what it yields so
 * far: `room` is the verified emails of the search the account's allowance can
 * still take this month (what is left, each counting ICP_EMAIL_WEIGHT);
 * `settled` the search's companies whose crawl ended and whose addresses came
 * back from their checks (or that have none to check), `valid` the valid
 * addresses among them. A company still waiting for fit after its crawl is
 * not settled: it may yet be dropped. Nor is one with a crawl, fit, people or
 * verify job queued or running: its people job may still make addresses to
 * check. The jobs are read by jobs_search_status_idx, a search's few at a time.
 */
export async function searchQuota(
  sql: Db,
  userId: string,
  searchId: string,
  now: Date = new Date(),
): Promise<{ room: number; settled: number; valid: number }> {
  const left = emailsPerMonth(await planOf(sql, userId)) - (await emailsVerified(sql, userId, periodOf(now)));
  const [row] = await sql<{ settled: number; valid: number }[]>`
    with live as materialized (
      select type, payload from jobs
      where search_id = ${searchId} and status in ('queued', 'running') and type in ('crawl', 'people', 'fit', 'verify')
    ), busy as (
      select payload ->> 'companyId' as id from live where type in ('crawl', 'people')
      union
      select jsonb_array_elements_text(payload -> 'companyIds') from live where type = 'fit'
      union
      select e.company_id::text from live l join emails e on e.id = (l.payload ->> 'emailId')::uuid where l.type = 'verify'
    )
    select count(*)::int as settled, coalesce(sum(s.valid), 0)::int as valid from (
      select (select count(*) from emails e where e.company_id = c.id and e.verification = 'valid') as valid
      from companies c
      where c.search_id = ${searchId} and c.crawl_status <> 'pending' and c.fit_state is distinct from 'pending'
        and not exists (select 1 from busy b where b.id = c.id::text)
        and (
          exists (select 1 from emails e where e.company_id = c.id and e.verification is not null)
          or not exists (select 1 from emails e where e.company_id = c.id and e.verification is null and e.skipped is null)
        )
    ) s
  `;
  return { room: Math.max(0, Math.floor(left / ICP_EMAIL_WEIGHT)), settled: row?.settled ?? 0, valid: row?.valid ?? 0 };
}
