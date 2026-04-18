import type { FastifyInstance } from "fastify";
import { clerkAuth } from "../auth.js";
import { one } from "../db.js";
import { PLAN_LIMITS, resolvePlan } from "../billing/plan-limits.js";
import { currentInFlight } from "../billing/concurrency.js";

export async function billingRoutes(app: FastifyInstance) {
  app.get("/api/usage", { preHandler: clerkAuth }, async (req) => {
    const user = req.user!;
    const plan = resolvePlan(user.plan);
    const limits = PLAN_LIMITS[plan];

    const row = await one<{ count: number; overage_count: number }>(
      `SELECT count, overage_count FROM daily_quotas
       WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
      [user.id],
    );

    return {
      plan,
      daily: {
        used: row?.count ?? 0,
        limit: limits.dailyExecutions,
        overage: row?.overage_count ?? 0,
      },
      concurrency: {
        inFlight: currentInFlight(user.id),
        limit: limits.concurrency,
      },
      rate: {
        perSecond: limits.ratePerSecond,
        burst: limits.rateBurst,
      },
      timeoutMs: limits.timeoutMs,
      allowOverage: limits.allowOverage,
      retentionDays: limits.retentionDays,
    };
  });
}
