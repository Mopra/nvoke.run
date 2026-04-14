export type PlanKey = "free" | "nano" | "scale";

export interface PlanLimits {
  dailyExecutions: number;
  timeoutMs: number;
  concurrency: number;
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free: {
    dailyExecutions: 100,
    timeoutMs: 15_000,
    concurrency: 1,
  },
  nano: {
    dailyExecutions: 1_000,
    timeoutMs: 30_000,
    concurrency: 3,
  },
  scale: {
    dailyExecutions: 10_000,
    timeoutMs: 30_000,
    concurrency: 10,
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "free" || value === "nano" || value === "scale";
}

export function resolvePlan(value: unknown): PlanKey {
  return isPlanKey(value) ? value : "free";
}
