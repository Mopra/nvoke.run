// Which plan a user holds, read from Clerk Billing.
//
// Plans are Clerk Billing user plans whose slugs are the plan keys in
// packages/shared/src/plans.ts. Checkout and cancel happen on the site
// (apps/site/app/desktop/billing); the server only reads the result.

import { createClerkClient } from '@clerk/backend';
import { FREE_PLAN, PLAN_ORDER, isPlan, type Plan } from '@nvoke/shared';

/** A subscription item as far as plan resolution cares. */
export interface HeldItem {
  status: string;
  slug: string | null;
  /** Unix ms. Null when the item has no end yet. */
  periodEnd: number | null;
}

export interface Resolved {
  plan: Plan;
  /** Slugs Clerk reported that the catalog does not know. Always a dashboard mistake. */
  unknownSlugs: string[];
}

/**
 * The most generous plan among the items the user still holds. Active and
 * past due items count (Clerk retries the payment; we keep the plan while it
 * does). A canceled item counts until its period ends. No item means Free.
 */
export function resolvePlan(items: readonly HeldItem[], now: number = Date.now()): Resolved {
  const unknownSlugs: string[] = [];
  let best: Plan = FREE_PLAN;
  for (const item of items) {
    const held =
      item.status === 'active' ||
      item.status === 'past_due' ||
      (item.status === 'canceled' && item.periodEnd !== null && item.periodEnd > now);
    if (!held || !item.slug) continue;
    if (!isPlan(item.slug)) {
      unknownSlugs.push(item.slug);
      continue;
    }
    if (PLAN_ORDER.indexOf(item.slug) > PLAN_ORDER.indexOf(best)) best = item.slug;
  }
  return { plan: best, unknownSlugs };
}

/**
 * A plan granted by hand in the Clerk dashboard: `publicMetadata.plan` set to
 * a plan key gives the user that plan without paying (staff, partners).
 * Counts like an active subscription, so a paid plan above it still wins.
 */
export function grantedItem(publicMetadata: Record<string, unknown> | null | undefined): HeldItem | null {
  const slug = publicMetadata?.plan;
  return typeof slug === 'string' && slug ? { status: 'active', slug, periodEnd: null } : null;
}

/** Reads a user's plan from the billing provider. */
export interface PlanSource {
  /**
   * The plan the user holds. Throws when the provider could not be reached;
   * the caller keeps the plan it has on record.
   */
  planOf(clerkUserId: string): Promise<Resolved>;
}

export function clerkPlanSource(secretKey: string): PlanSource {
  const clerk = createClerkClient({ secretKey });
  return {
    async planOf(clerkUserId) {
      let items: HeldItem[];
      try {
        const sub = await clerk.billing.getUserBillingSubscription(clerkUserId);
        items = sub.subscriptionItems.map((i) => ({
          status: i.status,
          slug: i.plan?.slug ?? null,
          periodEnd: i.periodEnd,
        }));
      } catch (err) {
        // A user who never subscribed has no billing subscription at all.
        if ((err as { status?: number }).status === 404) items = [];
        else throw err;
      }
      const granted = grantedItem((await clerk.users.getUser(clerkUserId)).publicMetadata);
      return resolvePlan(granted ? [...items, granted] : items);
    },
  };
}
