import { q, one } from "../db.js";
import type { HttpMethod } from "./functions.js";

export interface Schedule {
  id: string;
  function_id: string;
  user_id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  request_method: HttpMethod;
  request_headers: Record<string, string>;
  request_body: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDue {
  id: string;
  function_id: string;
  user_id: string;
  cron_expression: string;
  timezone: string;
  request_method: HttpMethod;
  request_headers: Record<string, string>;
  request_body: string | null;
}

const COLS =
  "id, function_id, user_id, name, cron_expression, timezone, request_method, request_headers, request_body, enabled, next_run_at, last_run_at, last_run_status, created_at, updated_at";

export const listSchedules = (functionId: string, userId: string) =>
  q<Schedule>(
    `SELECT ${COLS} FROM schedules
      WHERE function_id=$1 AND user_id=$2
      ORDER BY created_at DESC`,
    [functionId, userId],
  );

export const getSchedule = (id: string, userId: string) =>
  one<Schedule>(
    `SELECT ${COLS} FROM schedules WHERE id=$1 AND user_id=$2`,
    [id, userId],
  );

export const createSchedule = (input: {
  function_id: string;
  user_id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  request_method: HttpMethod;
  request_headers: Record<string, string>;
  request_body: string | null;
  enabled: boolean;
  next_run_at: Date;
}) =>
  one<Schedule>(
    `INSERT INTO schedules
       (function_id, user_id, name, cron_expression, timezone,
        request_method, request_headers, request_body, enabled, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
     RETURNING ${COLS}`,
    [
      input.function_id,
      input.user_id,
      input.name,
      input.cron_expression,
      input.timezone,
      input.request_method,
      JSON.stringify(input.request_headers ?? {}),
      input.request_body,
      input.enabled,
      input.next_run_at,
    ],
  );

export const updateSchedule = (
  id: string,
  userId: string,
  patch: {
    name?: string;
    cron_expression?: string;
    timezone?: string;
    request_method?: HttpMethod;
    request_headers?: Record<string, string>;
    request_body?: string | null;
    enabled?: boolean;
    next_run_at?: Date | null;
  },
) =>
  one<Schedule>(
    `UPDATE schedules SET
       name             = COALESCE($3, name),
       cron_expression  = COALESCE($4, cron_expression),
       timezone         = COALESCE($5, timezone),
       request_method   = COALESCE($6, request_method),
       request_headers  = COALESCE($7::jsonb, request_headers),
       request_body     = CASE WHEN $9::boolean THEN $8 ELSE request_body END,
       enabled          = COALESCE($10, enabled),
       next_run_at      = CASE WHEN $12::boolean THEN $11 ELSE next_run_at END,
       updated_at       = now()
     WHERE id=$1 AND user_id=$2
     RETURNING ${COLS}`,
    [
      id,
      userId,
      patch.name ?? null,
      patch.cron_expression ?? null,
      patch.timezone ?? null,
      patch.request_method ?? null,
      patch.request_headers ? JSON.stringify(patch.request_headers) : null,
      patch.request_body ?? null,
      patch.request_body !== undefined,
      patch.enabled ?? null,
      patch.next_run_at ?? null,
      patch.next_run_at !== undefined,
    ],
  );

export const deleteSchedule = (id: string, userId: string) =>
  q("DELETE FROM schedules WHERE id=$1 AND user_id=$2", [id, userId]);

export const findDueSchedules = (limit = 25) =>
  q<ScheduleDue & { next_run_at: string }>(
    `SELECT id, function_id, user_id, cron_expression, timezone,
            request_method, request_headers, request_body, next_run_at
       FROM schedules
      WHERE enabled = true AND next_run_at IS NOT NULL AND next_run_at <= now()
      ORDER BY next_run_at ASC
      LIMIT $1`,
    [limit],
  );

// Optimistically advance next_run_at. Returns true if we claimed it;
// false if another worker got there first.
export const claimSchedule = async (
  id: string,
  expectedCurrentNextRun: string,
  newNextRunAt: Date,
): Promise<boolean> => {
  const rows = await q<{ id: string }>(
    `UPDATE schedules
        SET next_run_at = $3,
            last_run_at = now(),
            updated_at = now()
      WHERE id = $1 AND next_run_at = $2
      RETURNING id`,
    [id, expectedCurrentNextRun, newNextRunAt],
  );
  return rows.length > 0;
};

export const recordScheduleStatus = (id: string, lastRunStatus: string) =>
  q(
    `UPDATE schedules SET last_run_status = $2, updated_at = now() WHERE id = $1`,
    [id, lastRunStatus],
  );
