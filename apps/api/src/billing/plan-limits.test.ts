import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, isPlanKey, resolvePlan } from "./plan-limits.js";
import { tryAcquire, release, currentInFlight, _resetForTests } from "./concurrency.js";
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
