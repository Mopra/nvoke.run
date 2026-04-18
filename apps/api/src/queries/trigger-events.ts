import { q, one } from "../db.js";

export type TriggerEventKind =
  | "schedule_fired"
  | "schedule_skipped"
  | "schedule_error"
  | "webhook_received"
  | "webhook_rejected";

export type TriggerEventOutcome = "ok" | "error";

export interface TriggerEvent {
  id: string;
  function_id: string;
  user_id: string;
  schedule_id: string | null;
  invocation_id: string | null;
  kind: TriggerEventKind;
  outcome: TriggerEventOutcome;
  message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const insertTriggerEvent = (row: {
  function_id: string;
  user_id: string;
  schedule_id?: string | null;
  invocation_id?: string | null;
  kind: TriggerEventKind;
  outcome: TriggerEventOutcome;
  message?: string | null;
  details?: Record<string, unknown> | null;
}) =>
  one<TriggerEvent>(
    `INSERT INTO trigger_events
       (function_id, user_id, schedule_id, invocation_id, kind, outcome, message, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING *`,
    [
      row.function_id,
      row.user_id,
      row.schedule_id ?? null,
      row.invocation_id ?? null,
      row.kind,
      row.outcome,
      row.message ?? null,
      row.details ? JSON.stringify(row.details) : null,
    ],
  );

export const listTriggerEvents = (
  functionId: string,
  userId: string,
  opts: { limit?: number; kind?: TriggerEventKind } = {},
) => {
  const params: unknown[] = [functionId, userId];
  let kindClause = "";
  if (opts.kind) {
    params.push(opts.kind);
    kindClause = ` AND kind = $${params.length}`;
  }
  params.push(opts.limit ?? 50);
  return q<TriggerEvent>(
    `SELECT * FROM trigger_events
      WHERE function_id=$1 AND user_id=$2${kindClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
};
