import { q, one } from "../db.js";

export type TriggerKind = "editor" | "http";

export interface Invocation {
  id: string;
  function_id: string;
  user_id: string;
  source: "ui" | "api";
  input: unknown;
  output: unknown;
  logs: string[] | null;
  status: "success" | "error" | "timeout";
  duration_ms: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  trigger_kind: TriggerKind;
  request_method: string | null;
  request_path: string | null;
  request_headers: Record<string, string> | null;
  response_status: number | null;
  response_headers: Record<string, string> | null;
  response_body_preview: string | null;
}

export function insertInvocation(row: {
  function_id: string;
  user_id: string;
  source: "ui" | "api";
  input: unknown;
  output: unknown;
  logs: string[];
  status: "success" | "error" | "timeout";
  duration_ms: number;
  error_message: string | null;
  started_at: Date;
  completed_at: Date;
  trigger_kind: TriggerKind;
  request_method?: string | null;
  request_path?: string | null;
  request_headers?: Record<string, string> | null;
  response_status?: number | null;
  response_headers?: Record<string, string> | null;
  response_body_preview?: string | null;
}) {
  return one<Invocation>(
    `INSERT INTO invocations
       (function_id, user_id, source, input, output, logs, status, duration_ms,
        error_message, started_at, completed_at,
        trigger_kind, request_method, request_path, request_headers,
        response_status, response_headers, response_body_preview)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      row.function_id,
      row.user_id,
      row.source,
      row.input,
      row.output,
      row.logs,
      row.status,
      row.duration_ms,
      row.error_message,
      row.started_at,
      row.completed_at,
      row.trigger_kind,
      row.request_method ?? null,
      row.request_path ?? null,
      row.request_headers ?? null,
      row.response_status ?? null,
      row.response_headers ?? null,
      row.response_body_preview ?? null,
    ],
  );
}

export const listInvocations = (functionId: string, userId: string, limit = 50) =>
  q<Invocation>(
    `SELECT * FROM invocations
     WHERE function_id=$1 AND user_id=$2
     ORDER BY started_at DESC
     LIMIT $3`,
    [functionId, userId, limit],
  );

export const getInvocation = (id: string, userId: string) =>
  one<Invocation>("SELECT * FROM invocations WHERE id=$1 AND user_id=$2", [id, userId]);

export const listAllInvocations = (
  userId: string,
  opts: { status?: "success" | "error" | "timeout"; limit?: number } = {},
) => {
  const params: unknown[] = [userId];
  let statusClause = "";
  if (opts.status) {
    params.push(opts.status);
    statusClause = ` AND i.status=$${params.length}`;
  }
  params.push(opts.limit ?? 100);
  return q<Invocation & { function_name: string }>(
    `SELECT i.*, f.name AS function_name
     FROM invocations i
     JOIN functions f ON f.id = i.function_id
     WHERE i.user_id=$1${statusClause}
     ORDER BY i.started_at DESC
     LIMIT $${params.length}`,
    params,
  );
};
