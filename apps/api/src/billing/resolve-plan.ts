import { isPlanKey, resolvePlan, type PlanKey } from "./plan-limits.js";

// Clerk Billing encodes active plans in the `pla` session claim as a
// comma-separated list of "<scope>:<slug>" entries (e.g. "u:nano,o:team").
// Pick the first user-scoped plan we recognize; fall back to publicMetadata.
export function resolvePlanFromClerk(
  claims: Record<string, unknown>,
  publicMetadata: Record<string, unknown> | undefined,
): PlanKey {
  const pla = claims.pla;
  if (typeof pla === "string") {
    for (const entry of pla.split(",")) {
      const [scope, slug] = entry.trim().split(":");
      if (scope === "u" && isPlanKey(slug)) return slug;
    }
  }
  return resolvePlan(publicMetadata?.plan);
}
