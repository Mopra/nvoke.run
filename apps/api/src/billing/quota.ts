import { one } from "../db.js";

export interface QuotaResult {
  allowed: boolean;
  count: number;
  overageCount: number;
  limit: number;
  isOverage: boolean;
}

export async function reserveDailyQuota(
  userId: string,
  limit: number,
  allowOverage: boolean,
): Promise<QuotaResult> {
  const row = await one<{ count: number; overage_count: number }>(
    `INSERT INTO daily_quotas (user_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE
       SET count = daily_quotas.count + 1
       WHERE daily_quotas.count < $2
     RETURNING count, overage_count`,
    [userId, limit],
  );

  if (row) {
    return {
      allowed: true,
      count: row.count,
      overageCount: row.overage_count,
      limit,
      isOverage: false,
    };
  }

  if (allowOverage) {
    const bumped = await one<{ count: number; overage_count: number }>(
      `UPDATE daily_quotas
         SET count = count + 1,
             overage_count = overage_count + 1
       WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date
       RETURNING count, overage_count`,
      [userId],
    );
    if (bumped) {
      return {
        allowed: true,
        count: bumped.count,
        overageCount: bumped.overage_count,
        limit,
        isOverage: true,
      };
    }
  }

  const existing = await one<{ count: number; overage_count: number }>(
    `SELECT count, overage_count FROM daily_quotas
     WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
    [userId],
  );
  return {
    allowed: false,
    count: existing?.count ?? limit,
    overageCount: existing?.overage_count ?? 0,
    limit,
    isOverage: false,
  };
}
