import { PLAN_LIMITS, type PlanKey, type PlanLimits } from "./plan-limits.js";
import { reserveDailyQuota } from "./quota.js";
import { tryAcquire, release } from "./concurrency.js";
import { tryConsume } from "./rate-limit.js";

export type EnforcementDenial =
  | {
      ok: false;
      status: 429;
      code: "rate_limited";
      limit: number;
      plan: PlanKey;
      retryAfterMs: number;
    }
  | {
      ok: false;
      status: 429;
      code: "concurrency_exceeded";
      limit: number;
      plan: PlanKey;
    }
  | {
      ok: false;
      status: 429;
      code: "quota_exceeded";
      limit: number;
      plan: PlanKey;
    };

export type EnforcementGrant = {
  ok: true;
  limits: PlanLimits;
  isOverage: boolean;
  release: () => void;
};

export type EnforcementResult = EnforcementGrant | EnforcementDenial;

export async function enforceInvocation(
  userId: string,
  plan: PlanKey,
): Promise<EnforcementResult> {
  const limits = PLAN_LIMITS[plan];

  const rate = tryConsume(userId, limits.ratePerSecond, limits.rateBurst);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      limit: limits.ratePerSecond,
      plan,
      retryAfterMs: rate.retryAfterMs,
    };
  }

  if (!tryAcquire(userId, limits.concurrency)) {
    return {
      ok: false,
      status: 429,
      code: "concurrency_exceeded",
      limit: limits.concurrency,
      plan,
    };
  }

  const quota = await reserveDailyQuota(
    userId,
    limits.dailyExecutions,
    limits.allowOverage,
  );
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
    isOverage: quota.isOverage,
    release: () => {
      if (released) return;
      released = true;
      release(userId);
    },
  };
}

export function denialRetryAfterSeconds(denial: EnforcementDenial): number {
  if (denial.code === "rate_limited") {
    return Math.max(1, Math.ceil(denial.retryAfterMs / 1000));
  }
  return 1;
}

export function denialBody(denial: EnforcementDenial) {
  const base = {
    error: denial.code,
    plan: denial.plan,
    limit: denial.limit,
    upgrade_url: denial.plan === "scale" ? null : "/billing",
  };
  if (denial.code === "rate_limited") {
    return {
      ...base,
      message: "request rate exceeded, slow down",
      retry_after_ms: denial.retryAfterMs,
    };
  }
  if (denial.code === "concurrency_exceeded") {
    return { ...base, message: "concurrent execution limit reached" };
  }
  return { ...base, message: "daily execution limit reached" };
}
