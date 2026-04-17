import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, isPlanKey, resolvePlan } from "./plan-limits.js";
import { tryAcquire, release, currentInFlight, _resetForTests } from "./concurrency.js";
import {
  tryConsume,
  _resetForTests as _resetRateLimitForTests,
} from "./rate-limit.js";
import { resolvePlanFromClerk } from "./resolve-plan.js";

describe("PLAN_LIMITS", () => {
  it("defines the three tiers with the expected ladder", () => {
    expect(PLAN_LIMITS.free.dailyExecutions).toBe(100);
    expect(PLAN_LIMITS.nano.dailyExecutions).toBe(1_000);
    expect(PLAN_LIMITS.scale.dailyExecutions).toBe(10_000);

    expect(PLAN_LIMITS.free.timeoutMs).toBe(15_000);
    expect(PLAN_LIMITS.nano.timeoutMs).toBe(30_000);
    expect(PLAN_LIMITS.scale.timeoutMs).toBe(30_000);

    expect(PLAN_LIMITS.free.concurrency).toBe(1);
    expect(PLAN_LIMITS.nano.concurrency).toBe(3);
    expect(PLAN_LIMITS.scale.concurrency).toBe(10);

    expect(PLAN_LIMITS.free.ratePerSecond).toBe(5);
    expect(PLAN_LIMITS.nano.ratePerSecond).toBe(10);
    expect(PLAN_LIMITS.scale.ratePerSecond).toBe(30);

    expect(PLAN_LIMITS.free.allowOverage).toBe(false);
    expect(PLAN_LIMITS.nano.allowOverage).toBe(false);
    expect(PLAN_LIMITS.scale.allowOverage).toBe(true);
  });
});

describe("rate limit token bucket", () => {
  it("allows up to the burst, then denies", () => {
    _resetRateLimitForTests();
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(tryConsume("u", 5, 10, now).allowed).toBe(true);
    }
    const denied = tryConsume("u", 5, 10, now);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    _resetRateLimitForTests();
    const start = 2_000_000;
    for (let i = 0; i < 10; i++) tryConsume("u", 5, 10, start);
    expect(tryConsume("u", 5, 10, start).allowed).toBe(false);
    // 1s later we should have refilled ~5 tokens
    expect(tryConsume("u", 5, 10, start + 1000).allowed).toBe(true);
  });

  it("tracks users independently", () => {
    _resetRateLimitForTests();
    const now = 3_000_000;
    for (let i = 0; i < 10; i++) tryConsume("a", 5, 10, now);
    expect(tryConsume("a", 5, 10, now).allowed).toBe(false);
    expect(tryConsume("b", 5, 10, now).allowed).toBe(true);
  });
});

describe("resolvePlan", () => {
  it("accepts known plan keys", () => {
    expect(resolvePlan("free")).toBe("free");
    expect(resolvePlan("nano")).toBe("nano");
    expect(resolvePlan("scale")).toBe("scale");
  });

  it("falls back to free for unknown values", () => {
    expect(resolvePlan("premium")).toBe("free");
    expect(resolvePlan(undefined)).toBe("free");
    expect(resolvePlan(null)).toBe("free");
    expect(resolvePlan(42)).toBe("free");
  });

  it("type guards correctly", () => {
    expect(isPlanKey("nano")).toBe(true);
    expect(isPlanKey("pro")).toBe(false);
  });
});

describe("resolvePlanFromClerk", () => {
  it("reads user-scoped plan from the pla claim", () => {
    expect(resolvePlanFromClerk({ pla: "u:nano" }, undefined)).toBe("nano");
    expect(resolvePlanFromClerk({ pla: "u:scale,o:team" }, undefined)).toBe("scale");
  });

  it("skips org-scoped entries", () => {
    expect(resolvePlanFromClerk({ pla: "o:nano" }, undefined)).toBe("free");
  });

  it("falls back to publicMetadata", () => {
    expect(resolvePlanFromClerk({}, { plan: "nano" })).toBe("nano");
  });

  it("returns free when nothing matches", () => {
    expect(resolvePlanFromClerk({}, undefined)).toBe("free");
    expect(resolvePlanFromClerk({ pla: "u:mystery" }, { plan: "also_mystery" })).toBe("free");
  });
});

describe("concurrency tracker", () => {
  it("acquires up to the limit and rejects beyond", () => {
    _resetForTests();
    expect(tryAcquire("user-1", 2)).toBe(true);
    expect(tryAcquire("user-1", 2)).toBe(true);
    expect(tryAcquire("user-1", 2)).toBe(false);
    expect(currentInFlight("user-1")).toBe(2);
  });

  it("release frees a slot", () => {
    _resetForTests();
    tryAcquire("u", 1);
    expect(tryAcquire("u", 1)).toBe(false);
    release("u");
    expect(tryAcquire("u", 1)).toBe(true);
  });

  it("tracks users independently", () => {
    _resetForTests();
    tryAcquire("a", 1);
    expect(tryAcquire("a", 1)).toBe(false);
    expect(tryAcquire("b", 1)).toBe(true);
  });
});
