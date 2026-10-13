// Pricing for the site, built on the shared plan ladder in @nvoke/shared, so
// the site, the server and the desktop app always show the same numbers.
// Clerk Billing charges in USD.

import { FREE_PLAN, PAID_PLANS, PLANS, PLAN_ORDER, TOP_PLAN, planLabel, type Plan } from '@nvoke/shared';

export type Tier = {
  plan: Plan;
  /** "Free", or the allowance like "2,500". */
  label: string;
  /** Monthly price in USD, excluding VAT. */
  price: number;
  emailsPerMonth: number;
};

function tier(plan: Plan): Tier {
  return { plan, label: planLabel(plan), price: PLANS[plan].priceUsd, emailsPerMonth: PLANS[plan].emailsPerMonth };
}

export const pricing = {
  currency: 'USD',
  locale: 'en-US',
  vatNote: 'Prices are per month in US dollars and exclude VAT.',
  tiers: PLAN_ORDER.map(tier),
  paidTiers: PAID_PLANS.map(tier),
  free: tier(FREE_PLAN),
  cheapest: tier(PAID_PLANS[0]!),
  top: tier(TOP_PLAN),
};

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat(pricing.locale, {
    style: 'currency',
    currency: pricing.currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Effective price per 1,000 verified emails, like "$3.60". */
export function pricePerThousand(t: Tier): string {
  return formatPrice(Math.round((t.price / t.emailsPerMonth) * 1000 * 100) / 100);
}
