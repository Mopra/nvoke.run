import { one } from "../db.js";
import { resolvePlan, type PlanKey } from "../billing/plan-limits.js";

export interface User {
  id: string;
  clerk_id: string;
  email: string;
  plan: PlanKey;
  created_at: string;
}

export async function upsertUser(
  clerkId: string,
  email: string,
  plan: PlanKey,
): Promise<User> {
  const row = await one<User>(
    `INSERT INTO users (clerk_id, email, plan)
     VALUES ($1, $2, $3)
     ON CONFLICT (clerk_id) DO UPDATE
       SET email = EXCLUDED.email,
           plan = EXCLUDED.plan
     RETURNING *`,
    [clerkId, email, plan],
  );
  return row!;
}

export async function getUserPlan(userId: string): Promise<PlanKey> {
  const row = await one<{ plan: string }>(
    `SELECT plan FROM users WHERE id = $1`,
    [userId],
  );
  return resolvePlan(row?.plan);
}
