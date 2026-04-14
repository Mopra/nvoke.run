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

    const row = await one<{ count: number }>(
      `SELECT count FROM daily_quotas
       WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
      [user.id],
    );

    return {
      plan,
      daily: {
        used: row?.count ?? 0,
        limit: limits.dailyExecutions,
      },
      concurrency: {
        inFlight: currentInFlight(user.id),
        limit: limits.concurrency,
      },
      timeoutMs: limits.timeoutMs,
    };
  });
}
