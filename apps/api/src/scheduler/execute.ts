import { getFunction, runnableCode } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { loadSecretEnv } from "../queries/secrets.js";
import { insertTriggerEvent } from "../queries/trigger-events.js";
import { recordScheduleStatus } from "../queries/schedules.js";
import { getUserPlan } from "../queries/users.js";
import { execute, type NormalizedHttpRequest } from "../executor.js";
import { extractPersistedRun, limitHeaderPreview } from "../http-invoke.js";
import { enforceInvocation } from "../billing/enforce.js";
import type { ScheduleDue } from "../queries/schedules.js";

function parseBody(
  raw: string | null,
  headers: Record<string, string>,
): unknown {
  if (raw == null || raw.length === 0) return null;
  const contentType =
    headers["content-type"] ?? headers["Content-Type"] ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function runSchedule(
  schedule: ScheduleDue,
  log: (level: "info" | "warn" | "error", msg: string, meta?: unknown) => void,
): Promise<void> {
  const fn = await getFunction(schedule.function_id, schedule.user_id);
  if (!fn) {
    await insertTriggerEvent({
      function_id: schedule.function_id,
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      kind: "schedule_error",
      outcome: "error",
      message: "function not found",
    });
    await recordScheduleStatus(schedule.id, "error");
    return;
  }

  if (!fn.enabled) {
    await insertTriggerEvent({
      function_id: fn.id,
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      kind: "schedule_skipped",
      outcome: "error",
      message: "function disabled",
    });
    await recordScheduleStatus(schedule.id, "skipped");
    return;
  }

  const runnable = runnableCode(fn);
  if (!runnable.ok) {
    await insertTriggerEvent({
      function_id: fn.id,
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      kind: "schedule_error",
      outcome: "error",
      message: runnable.error,
    });
    await recordScheduleStatus(schedule.id, "error");
    return;
  }

  const plan = await getUserPlan(schedule.user_id);
  const gate = await enforceInvocation(schedule.user_id, plan);
  if (!gate.ok) {
    await insertTriggerEvent({
      function_id: fn.id,
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      kind: "schedule_skipped",
      outcome: "error",
      message: gate.code,
      details: { plan: gate.plan, limit: gate.limit },
    });
    await recordScheduleStatus(schedule.id, "skipped");
    log("warn", "scheduled run skipped by billing gate", {
      scheduleId: schedule.id,
      code: gate.code,
    });
    return;
  }

  const headers = schedule.request_headers ?? {};
  const request: NormalizedHttpRequest = {
    method: schedule.request_method,
    path: "/",
    query: {},
    headers,
    body: parseBody(schedule.request_body, headers),
  };

  const env = await loadSecretEnv(fn.id);
  const started = new Date();
  try {
    const result = await execute(runnable.code, {
      request,
      env,
      timeoutMs: gate.limits.timeoutMs,
    });
    const completed = new Date();
    const persisted = extractPersistedRun(result);

    const invocation = await insertInvocation({
      function_id: fn.id,
      function_version_id: fn.current_version_id,
      user_id: schedule.user_id,
      source: "api",
      input: request.body ?? null,
      output: persisted.output,
      logs: result.logs,
      status: persisted.status,
      duration_ms: result.duration_ms,
      error_message: persisted.error_message,
      started_at: started,
      completed_at: completed,
      trigger_kind: "scheduled",
      request_method: request.method,
      request_path: request.path,
      request_headers: limitHeaderPreview(request.headers),
      response_status: persisted.response_status,
      response_headers: persisted.response_headers,
      response_body_preview: persisted.response_body_preview,
    });

    await insertTriggerEvent({
      function_id: fn.id,
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      invocation_id: invocation?.id ?? null,
      kind: "schedule_fired",
      outcome: persisted.status === "success" ? "ok" : "error",
      message: persisted.error_message ?? null,
    });
    await recordScheduleStatus(schedule.id, persisted.status);
  } finally {
    gate.release();
  }
}
