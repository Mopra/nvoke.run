import { one } from "../db.js";

export interface QuotaResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function reserveDailyQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const row = await one<{ count: number }>(
    `INSERT INTO daily_quotas (user_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE
       SET count = daily_quotas.count + 1
       WHERE daily_quotas.count < $2
     RETURNING count`,
    [userId, limit],
  );

  if (!row) {
    const existing = await one<{ count: number }>(
      `SELECT count FROM daily_quotas
       WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
      [userId],
    );
    return { allowed: false, count: existing?.count ?? limit, limit };
  }

  return { allowed: true, count: row.count, limit };
}
