// What Claude costs each account, and the monthly cap on it.
//
// Every call is recorded in ai_usage. Before a call, the account's spend this
// calendar month (UTC) is compared with its budget: a share of the plan's
// price, never below a floor, so the free plan can still try the features.
// The check is not locked, so calls running at once can overshoot the budget
// by their own cost; that is fine for a guard against runaway spend.

import type { Sql, TransactionSql } from 'postgres';
import { PLANS } from '@nvoke/shared';
import { planOf } from '../leads/quota.js';
import type { TokenCounts } from './models.js';

type Db = Sql | TransactionSql;

export interface BudgetRule {
  /** Budget of the free plan, and the least any plan gets. */
  floorUsd: number;
  /** Share of the plan's monthly price that may go to Claude. */
  priceShare: number;
}

export interface UsageRow extends TokenCounts {
  userId: string;
  task: string;
  model: string;
  costUsd: number;
}

export async function recordUsage(sql: Db, row: UsageRow, at: Date = new Date()): Promise<void> {
  await sql`
    insert into ai_usage (clerk_user_id, task, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, created_at)
    values (${row.userId}, ${row.task}, ${row.model}, ${row.inputTokens}, ${row.outputTokens},
            ${row.cacheReadTokens}, ${row.cacheWriteTokens}, ${row.costUsd}, ${at.toISOString()})
  `;
}

function monthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** USD spent on Claude by the account in the calendar month (UTC) of `at`. */
export async function spentThisMonth(sql: Db, userId: string, at: Date = new Date()): Promise<number> {
  const rows = await sql<{ spent: string }[]>`
    select coalesce(sum(cost_usd), 0) as spent from ai_usage
    where clerk_user_id = ${userId} and created_at >= ${monthStart(at).toISOString()}
  `;
  return Number(rows[0]?.spent ?? 0);
}

export async function monthlyBudgetUsd(sql: Db, userId: string, rule: BudgetRule): Promise<number> {
  const plan = await planOf(sql, userId);
  return Math.max(rule.floorUsd, PLANS[plan].priceUsd * rule.priceShare);
}
