import { z } from 'zod';

/**
 * The plan ladder: the single source of truth for pricing on the server, the
 * site and the desktop app.
 *
 * nvoke has one product for everyone. Every feature is on every plan; a plan
 * is only a monthly allowance of verified emails at a price. A verified email
 * is an address whose mailbox check came back `valid`. Invalid, risky,
 * catch-all and unknown results are free, and an address the user was already
 * charged for in the last 12 months is not charged again.
 *
 * Each paid key IS the Clerk Billing plan slug (user plans, configured in the
 * Clerk dashboard), so the webhook, the plan sync and the checkout all key off
 * the same string. `free` is Clerk's default user plan and has no price.
 */

export const PLAN_KEYS = [
  'free',
  'emails_1000',
  'emails_2500',
  'emails_10000',
  'emails_25000',
  'emails_60000',
] as const;

export const Plan = z.enum(PLAN_KEYS);
export type Plan = z.infer<typeof Plan>;

export interface PlanMeta {
  /** Verified emails per calendar month (UTC). */
  emailsPerMonth: number;
  /** Price per month in USD, excluding VAT. 0 for the free plan. */
  priceUsd: number;
  /**
   * Most companies one search may ask for. Grows with the allowance so a
   * paying user can spend it in a few searches, and stops at 25,000 so no
   * single search turns into a job of hundreds of thousands.
   */
  maxSearchLimit: number;
  /** Most companies one drop may deliver a day. */
  maxDropDailyLimit: number;
}

export const PLANS: Record<Plan, PlanMeta> = {
  free: { emailsPerMonth: 50, priceUsd: 0, maxSearchLimit: 1_000, maxDropDailyLimit: 200 },
  emails_1000: { emailsPerMonth: 1_000, priceUsd: 9, maxSearchLimit: 2_500, maxDropDailyLimit: 250 },
  emails_2500: { emailsPerMonth: 2_500, priceUsd: 19, maxSearchLimit: 5_000, maxDropDailyLimit: 500 },
  emails_10000: { emailsPerMonth: 10_000, priceUsd: 49, maxSearchLimit: 10_000, maxDropDailyLimit: 1_000 },
  emails_25000: { emailsPerMonth: 25_000, priceUsd: 99, maxSearchLimit: 20_000, maxDropDailyLimit: 2_500 },
  emails_60000: { emailsPerMonth: 60_000, priceUsd: 199, maxSearchLimit: 25_000, maxDropDailyLimit: 5_000 },
};

export const FREE_PLAN: Plan = 'free';

/** Plan keys from the free plan to the top of the ladder. */
export const PLAN_ORDER: readonly Plan[] = PLAN_KEYS;

/** The paid plans, cheapest first. These are the plans that exist in Clerk. */
export const PAID_PLANS: readonly Plan[] = PLAN_KEYS.filter((p) => p !== FREE_PLAN);

/** The most generous self-serve plan. Above it, people write to us. */
export const TOP_PLAN: Plan = 'emails_60000';

/**
 * How many verified emails one valid address counts as, by the kind of search
 * that found it. Sonar (`icp`) plans the search and scores every company with
 * Claude and pays for web search, so its emails count as three. Every other
 * kind counts one.
 */
export const ICP_EMAIL_WEIGHT = 3;

/** The product name of the `icp` search kind, on every screen and page. */
export const ICP_NAME = 'Sonar';

export function emailWeight(kind: string): number {
  return kind === 'icp' ? ICP_EMAIL_WEIGHT : 1;
}

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

/** `GET /v1/plans` (public): the ladder, cheapest first. */
export const PlansResponse = z.object({
  plans: z.array(
    z.object({
      key: Plan,
      emailsPerMonth: z.number().int().positive(),
      priceUsd: z.number().nonnegative(),
      maxSearchLimit: z.number().int().positive(),
      maxDropDailyLimit: z.number().int().positive(),
    }),
  ),
});
export type PlansResponse = z.infer<typeof PlansResponse>;
