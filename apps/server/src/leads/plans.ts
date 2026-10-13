import type { Plan } from '@nvoke/shared';

export interface PlanLimits {
  /** Emails found (stored) per calendar month, UTC. */
  emailsPerMonth: number;
  /** Highest `limit` (companies) one search may ask for. */
  maxSearchLimit: number;
}

/** Plan limits. Email quotas are from docs/SPEC.md; search caps are ours. */
export const PLANS: Record<Plan, PlanLimits> = {
  free: { emailsPerMonth: 50, maxSearchLimit: 50 },
  pro: { emailsPerMonth: 2_000, maxSearchLimit: 500 },
  business: { emailsPerMonth: 10_000, maxSearchLimit: 1_000 },
};

/** The usage period for a moment in time: "yyyy-mm" in UTC. */
export function periodOf(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}
