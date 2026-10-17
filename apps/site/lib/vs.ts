// Competitor pricing for the /vs pages, read from each vendor's own pricing
// page on `readOn`. Update the numbers and the date together.

import { PLANS, planFor } from '@nvoke/shared';

export type VsPlan = {
  name: string;
  /** Credits per month on this plan. */
  credits: number;
  /** Price per month when paying month by month. null when not offered. */
  monthly: number | null;
  /** Price per month when paying a year up front. null when not listed. */
  annual: number | null;
  /** Priced per seat, with credits per seat (Apollo). */
  perSeat?: boolean;
  minSeats?: number;
};

export type Competitor = {
  slug: 'hunter' | 'snov' | 'apollo';
  name: string;
  currency: 'USD' | 'EUR';
  /** The vendor's pricing page. */
  source: string;
  /** ISO date the prices were read. */
  readOn: string;
  /** Credits one found-and-verified email costs on this vendor. */
  creditsPerEmail: number;
  /** One sentence on how we counted, shown next to the calculator. */
  creditNote: string;
  plans: VsPlan[];
};

/** Approximate EUR to USD rate used to put Hunter's euro prices next to nvoke's dollars. */
export const EUR_USD = 1.15;

export const COMPETITORS: Record<Competitor['slug'], Competitor> = {
  hunter: {
    slug: 'hunter',
    name: 'Hunter',
    currency: 'EUR',
    source: 'https://hunter.io/pricing',
    readOn: '2026-10-17',
    creditsPerEmail: 1,
    creditNote:
      'Hunter charges 1 credit per email found and 0.5 per standalone verification. Paid plans include auto-verification, so we count 1 credit per verified email.',
    plans: [
      { name: 'Free', credits: 50, monthly: 0, annual: 0 },
      { name: 'Starter', credits: 2_000, monthly: 49, annual: 34 },
      { name: 'Growth', credits: 10_000, monthly: 149, annual: 104 },
      { name: 'Scale', credits: 25_000, monthly: 299, annual: 209 },
    ],
  },
  snov: {
    slug: 'snov',
    name: 'Snov.io',
    currency: 'USD',
    source: 'https://snov.io/pricing',
    readOn: '2026-10-17',
    creditsPerEmail: 2,
    creditNote:
      'Snov.io charges 1 credit per prospect found and 1 credit per verification, so we count 2 credits for a found and verified email.',
    plans: [
      { name: 'Trial', credits: 50, monthly: 0, annual: 0 },
      { name: 'Starter', credits: 1_000, monthly: 39, annual: 29.25 },
      { name: 'Pro S', credits: 5_000, monthly: 99, annual: 74.25 },
      { name: 'Pro M', credits: 20_000, monthly: 189, annual: null },
      { name: 'Pro L', credits: 50_000, monthly: 369, annual: null },
      { name: 'Ultra', credits: 100_000, monthly: 738, annual: null },
    ],
  },
  apollo: {
    slug: 'apollo',
    name: 'Apollo',
    currency: 'USD',
    source: 'https://www.apollo.io/pricing',
    readOn: '2026-10-17',
    creditsPerEmail: 1,
    creditNote:
      'Apollo prices per seat and shares credits across seats. We count 1 credit per email and add seats when one seat is not enough.',
    plans: [
      { name: 'Free', credits: 75, monthly: 0, annual: 0, perSeat: true },
      { name: 'Basic', credits: 2_500, monthly: 65, annual: 49, perSeat: true },
      { name: 'Professional', credits: 4_000, monthly: 99, annual: 79, perSeat: true },
      { name: 'Organization', credits: 6_000, monthly: null, annual: 119, perSeat: true, minSeats: 3 },
    ],
  },
};

export type Quote = { plan: string; seats: number; price: number } | null;

/** The cheapest way to buy `emails` verified emails a month from `c`, or null above its published plans. */
export function quote(c: Competitor, emails: number, billing: 'monthly' | 'annual'): Quote {
  const need = emails * c.creditsPerEmail;
  let best: Quote = null;
  for (const p of c.plans) {
    const price = billing === 'annual' ? (p.annual ?? p.monthly) : p.monthly;
    if (price === null) continue;
    const minSeats = p.minSeats ?? 1;
    let seats = minSeats;
    if (p.perSeat && price > 0) {
      seats = Math.max(minSeats, Math.ceil(need / p.credits));
    } else if (need > p.credits) {
      continue;
    }
    const total = Math.round(seats * price * 100) / 100;
    if (!best || total < best.price) best = { plan: p.name, seats, price: total };
  }
  return best;
}

/** nvoke's price for `emails` verified emails a month, or null above its top self-serve plan. */
export function nvokeQuote(emails: number): { plan: string; price: number } | null {
  const key = planFor(emails);
  const meta = PLANS[key];
  if (meta.emailsPerMonth < emails) return null;
  return { plan: key === 'free' ? 'Free' : `${meta.emailsPerMonth.toLocaleString('en-US')} a month`, price: meta.priceUsd };
}

export function toUsd(c: Competitor, amount: number): number {
  return c.currency === 'EUR' ? amount * EUR_USD : amount;
}
