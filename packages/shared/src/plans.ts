import { z } from 'zod';

/**
 * The plan ladder: the single source of truth for pricing on the server, the
 * site and the desktop app.
 *
 * nvoke has one product for everyone. Every feature is on every plan; a plan
 * is only a monthly allowance of verified emails at a price. A verified email
 * is an address whose mailbox check came back `valid`. Invalid, risky,
 * catch-all and unknown results are free, and an address the user was already
 * charged for is never charged again.
 *
 * Each paid key IS the Clerk Billing plan slug (user plans, configured in the
 * Clerk dashboard), so the webhook, the plan sync and the checkout all key off
 * the same string. `free_user` is Clerk's default user plan and has no price.
 */

export const PLAN_KEYS = [
  'free_user',
  'emails_1000',
  'emails_2500',
  'emails_7500',
  'emails_20000',
  'emails_50000',
  'emails_100000',
] as const;

export const Plan = z.enum(PLAN_KEYS);
export type Plan = z.infer<typeof Plan>;

export interface PlanMeta {
  /** Verified emails per calendar month (UTC). */
  emailsPerMonth: number;
  /** Price per month in USD, excluding VAT. 0 for the free plan. */
  priceUsd: number;
}

export const PLANS: Record<Plan, PlanMeta> = {
  free_user: { emailsPerMonth: 50, priceUsd: 0 },
  emails_1000: { emailsPerMonth: 1_000, priceUsd: 5 },
  emails_2500: { emailsPerMonth: 2_500, priceUsd: 9 },
  emails_7500: { emailsPerMonth: 7_500, priceUsd: 19 },
  emails_20000: { emailsPerMonth: 20_000, priceUsd: 39 },
  emails_50000: { emailsPerMonth: 50_000, priceUsd: 79 },
  emails_100000: { emailsPerMonth: 100_000, priceUsd: 149 },
};

export const FREE_PLAN: Plan = 'free_user';

/** Plan keys from the free plan to the top of the ladder. */
export const PLAN_ORDER: readonly Plan[] = PLAN_KEYS;

/** The paid plans, cheapest first. These are the plans that exist in Clerk. */
export const PAID_PLANS: readonly Plan[] = PLAN_KEYS.filter((p) => p !== FREE_PLAN);

/** The most generous self-serve plan. Above it, people write to us. */
export const TOP_PLAN: Plan = 'emails_100000';

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}

/** Short label for a plan: "Free", or the allowance like "2,500". */
export function planLabel(plan: Plan): string {
  return plan === FREE_PLAN ? 'Free' : new Intl.NumberFormat('en-US').format(PLANS[plan].emailsPerMonth);
}

/** The next plan up, or null at the top of the ladder. */
export function nextPlanUp(plan: Plan): Plan | null {
  const i = PLAN_ORDER.indexOf(plan);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1]! : null;
}

/** The cheapest plan whose allowance covers `emails` a month (the top plan when none does). */
export function planFor(emails: number): Plan {
  return PLAN_ORDER.find((p) => PLANS[p].emailsPerMonth >= emails) ?? TOP_PLAN;
}
