import { FREE_PLAN, nextPlanUp, planLabel, type MeResponse, type Plan, type Search, type SearchStatus } from '@nvoke/shared';

/** The in-app billing page: the same Clerk Billing plans as /pricing. */
export const BILLING_PATH = '/app/billing';

/** Share of the allowance from which the app starts pointing at the next plan. */
export const LOW_SHARE = 80;

export type QuotaLevel = 'ok' | 'low' | 'out';

export interface QuotaState {
  used: number;
  limit: number;
  left: number;
  /** 0 to 100. */
  share: number;
  level: QuotaLevel;
  plan: Plan;
  /** The next plan up, or null on the top plan. */
  nextPlan: Plan | null;
}

/** Where the month's verified emails stand, and whether to show the upgrade path. */
export function quotaState(me: Pick<MeResponse, 'plan' | 'usage'>): QuotaState {
  const { emailsVerified: used, emailsLimit: limit } = me.usage;
  const left = Math.max(0, limit - used);
  const share = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 100;
  const level: QuotaLevel = left === 0 ? 'out' : share >= LOW_SHARE ? 'low' : 'ok';
  return { used, limit, left, share, level, plan: me.plan, nextPlan: nextPlanUp(me.plan) };
}

/** The plan's name as the app shows it: "Free" or "2,500 emails". */
export function planName(plan: Plan): string {
  return plan === FREE_PLAN ? 'Free' : `${planLabel(plan)} emails`;
}

/** A search the allowance stopped. Its results so far are kept. */
export function stoppedByQuota(search: Pick<Search, 'status' | 'error'>): boolean {
  return search.status === 'failed' && search.error === 'quota_exceeded';
}

/** Running searches are polled at this interval, as the spec asks. */
export const POLL_MS = 2000;

/** An ongoing search that is not running right now adds a few companies a day: a slow poll is plenty. */
export const ONGOING_POLL_MS = 60_000;

type Polled = Pick<Search, 'status'> & { ongoing?: boolean | null };

function live(status: SearchStatus): boolean {
  return status === 'queued' || status === 'running';
}

/** Poll the list while any search in it runs, slowly while one keeps filling. */
export function listPollInterval(searches: Polled[] | undefined): number | false {
  if (searches?.some((s) => live(s.status))) return POLL_MS;
  return searches?.some((s) => s.ongoing) ? ONGOING_POLL_MS : false;
}

/** Poll one search while it runs, slowly while it keeps filling. */
export function searchPollInterval(search: Polled | undefined): number | false {
  if (!search) return false;
  if (live(search.status)) return POLL_MS;
  return search.ongoing ? ONGOING_POLL_MS : false;
}
