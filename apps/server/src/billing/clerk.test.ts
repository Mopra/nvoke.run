import { describe, expect, it } from 'vitest';
import { billingUserId } from '../api/routes/webhooks.js';
import { resolvePlan } from './clerk.js';

const NOW = Date.parse('2026-10-13T12:00:00Z');

describe('resolvePlan', () => {
  it('is Free without subscription items', () => {
    expect(resolvePlan([], NOW)).toEqual({ plan: 'free_user', unknownSlugs: [] });
  });

  it('picks the most generous plan the user holds', () => {
    const items = [
      { status: 'active', slug: 'free_user', periodEnd: null },
      { status: 'active', slug: 'emails_7500', periodEnd: null },
      { status: 'upcoming', slug: 'emails_100000', periodEnd: null },
      { status: 'past_due', slug: 'emails_2500', periodEnd: null },
    ];
    expect(resolvePlan(items, NOW).plan).toBe('emails_7500');
  });

  it('keeps a canceled plan until its period ends', () => {
    const until = (periodEnd: number) => [{ status: 'canceled', slug: 'emails_1000', periodEnd }];
    expect(resolvePlan(until(NOW + 1000), NOW).plan).toBe('emails_1000');
    expect(resolvePlan(until(NOW - 1000), NOW).plan).toBe('free_user');
  });

  it('reports slugs the catalog does not know', () => {
    const r = resolvePlan([{ status: 'active', slug: 'emails_1k', periodEnd: null }], NOW);
    expect(r).toEqual({ plan: 'free_user', unknownSlugs: ['emails_1k'] });
  });
});

describe('billingUserId', () => {
  it('reads the paying user from billing events only', () => {
    expect(billingUserId('subscriptionItem.active', { payer: { user_id: 'user_1' } })).toBe('user_1');
    expect(billingUserId('subscription.updated', { payer: { user_id: 'user_2' } })).toBe('user_2');
    expect(billingUserId('subscriptionItem.active', { payer: { organization_id: 'org_1' } })).toBeNull();
    expect(billingUserId('user.updated', { payer: { user_id: 'user_1' } })).toBeNull();
  });
});
