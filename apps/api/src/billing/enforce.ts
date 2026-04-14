import { PLAN_LIMITS, type PlanKey, type PlanLimits } from "./plan-limits.js";
import { reserveDailyQuota } from "./quota.js";
import { tryAcquire, release } from "./concurrency.js";

export type EnforcementDenial =
  | { ok: false; status: 429; code: "quota_exceeded"; limit: number; plan: PlanKey }
  | { ok: false; status: 429; code: "concurrency_exceeded"; limit: number; plan: PlanKey };

export type EnforcementGrant = {
  ok: true;
  limits: PlanLimits;
  release: () => void;
};

export type EnforcementResult = EnforcementGrant | EnforcementDenial;

export async function enforceInvocation(
  userId: string,
  plan: PlanKey,
): Promise<EnforcementResult> {
  const limits = PLAN_LIMITS[plan];

  if (!tryAcquire(userId, limits.concurrency)) {
    return {
      ok: false,
      status: 429,
      code: "concurrency_exceeded",
      limit: limits.concurrency,
      plan,
    };
  }

  const quota = await reserveDailyQuota(userId, limits.dailyExecutions);
  if (!quota.allowed) {
    release(userId);
    return {
      ok: false,
      status: 429,
      code: "quota_exceeded",
      limit: limits.dailyExecutions,
      plan,
    };
  }

  let released = false;
  return {
    ok: true,
    limits,
    release: () => {
      if (released) return;
      released = true;
      release(userId);
    },
  };
}

export function denialBody(denial: EnforcementDenial) {
  return {
    error:
      denial.code === "quota_exceeded"
        ? "daily execution limit reached"
        : "concurrent execution limit reached",
    code: denial.code,
    plan: denial.plan,
    limit: denial.limit,
  };
}
