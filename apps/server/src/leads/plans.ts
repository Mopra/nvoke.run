import { FREE_PLAN, PLANS as LADDER, isPlan, type Plan } from '@nvoke/shared';

/** Verified emails a plan allows per calendar month. Unknown values get the free allowance. */
export function emailsPerMonth(plan: string): number {
  return LADDER[isPlan(plan) ? plan : FREE_PLAN].emailsPerMonth;
}

/** Highest `limit` (companies) one search may ask for on a plan. */
export function maxSearchLimit(plan: string): number {
  return LADDER[isPlan(plan) ? plan : FREE_PLAN].maxSearchLimit;
}

/** Highest `dailyLimit` a drop may have on a plan. */
export function maxDropDailyLimit(plan: string): number {
  return LADDER[isPlan(plan) ? plan : FREE_PLAN].maxDropDailyLimit;
}

export function asPlan(value: string | undefined): Plan {
  return isPlan(value) ? value : FREE_PLAN;
}

/** The usage period for a moment in time: "yyyy-mm" in UTC. */
export function periodOf(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}
