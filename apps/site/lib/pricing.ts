// Single source for the plans shown on the site. Prices are placeholders until
// they are set: change `price` here and every page follows. Monthly email
// limits match the server plan config (free 50, pro 2,000, business 10,000).

export type PlanId = 'free' | 'pro' | 'business';

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in `pricing.currency`, excluding VAT. */
  price: number;
  emailsPerMonth: number;
  summary: string;
  features: string[];
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    emailsPerMonth: 50,
    summary: 'Run a few searches and see what the results look like.',
    features: ['All three search kinds', 'Email verification', 'CSV export'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    emailsPerMonth: 2000,
    summary: 'For one person building lead lists every week.',
    features: ['All three search kinds', 'Email verification', 'CSV export', 'Email support'],
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 99,
    emailsPerMonth: 10000,
    summary: 'For teams that run outreach in several markets.',
    features: ['All three search kinds', 'Email verification', 'CSV export', 'Priority email support'],
  },
];

export const pricing = {
  currency: 'EUR',
  locale: 'en-IE',
  vatNote: 'Prices are per month and exclude VAT.',
  plans,
};

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat(pricing.locale, {
    style: 'currency',
    currency: pricing.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}
