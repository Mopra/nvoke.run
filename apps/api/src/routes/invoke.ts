import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction, runnableCode, SUPPORTED_METHODS } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { loadSecretEnv } from "../queries/secrets.js";
import { execute, type ExecResult } from "../executor.js";
import {
  buildRequestFromFastify,
  extractPersistedRun,
  limitHeaderPreview,
  verifyApiKey,
} from "../http-invoke.js";
import {
  enforceInvocation,
  denialBody,
  denialRetryAfterSeconds,
} from "../billing/enforce.js";
import { resolvePlan } from "../billing/plan-limits.js";

const IdParams = z.object({ id: z.string().uuid() });

function formatEditorResponse(invId: string, result: ExecResult) {
  if (result.status === "success") {
    return {
      invocation_id: invId,
      status: "success" as const,
      response: result.response,
      logs: result.logs,
      error: null,
      duration_ms: result.duration_ms,
    };
  }
  return {
    invocation_id: invId,
    status: result.status,
    response: null,
    logs: result.logs,
    error: (result as { error: string }).error,
    duration_ms: result.duration_ms,
  };
}

export async function invokeRoutes(app: FastifyInstance) {
  app.route({
    method: [...SUPPORTED_METHODS],
    url: "/api/functions/:id/invoke",
    preHandler: clerkAuth,
    handler: async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const fn = await getFunction(id, req.user!.id);
      if (!fn)
        return reply.code(404).send({ error: "not_found", message: "function not found" });

      const plan = resolvePlan(req.user!.plan);
      const gate = await enforceInvocation(req.user!.id, plan);
      if (!gate.ok) {
        req.log.warn(
          { userId: req.user!.id, plan: gate.plan, code: gate.code, limit: gate.limit },
          "invocation denied",
        );
        return reply
          .code(gate.status)
          .header("retry-after", String(denialRetryAfterSeconds(gate)))
          .send(denialBody(gate));
      }

      const request = buildRequestFromFastify(req);
      const env = await loadSecretEnv(fn.id);
      const started = new Date();
      let result: ExecResult;
      const runnable = runnableCode(fn);
      if (!runnable.ok) {
        gate.release();
        return reply
          .code(409)
          .send({ error: "build_required", message: runnable.error });
      }
      try {
        result = await execute(runnable.code, { request, env, timeoutMs: gate.limits.timeoutMs });
      } finally {
        gate.release();
      }
      if (result.status === "timeout") {
        req.log.warn(
          {
            userId: req.user!.id,
            plan,
            functionId: fn.id,
            timeoutMs: gate.limits.timeoutMs,
          },
          "invocation timed out",
        );
      }
      if (gate.isOverage) {
        req.log.info(
          { userId: req.user!.id, plan, functionId: fn.id },
          "invocation counted as overage",
        );
      }
      const completed = new Date();
      const persisted = extractPersistedRun(result);

      const inv = await insertInvocation({
        function_id: fn.id,
        function_version_id: fn.current_version_id,
        user_id: req.user!.id,
        source: "ui",
        input: req.body ?? null,
        output: persisted.output,
        logs: result.logs,
        status: persisted.status,
        duration_ms: result.duration_ms,
        error_message: persisted.error_message,
        started_at: started,
        completed_at: completed,
        trigger_kind: "editor",
        request_method: request.method,
        request_path: request.path,
        request_headers: limitHeaderPreview(request.headers),
        response_status: persisted.response_status,
        response_headers: persisted.response_headers,
        response_body_preview: persisted.response_body_preview,
      });

      return formatEditorResponse(inv!.id, result);
    },
  });

  // Legacy API-key invoke route. Kept JSON-wrapped for backward compatibility;
  // new traffic should use the stable /f/:slug endpoints.
  app.post("/api/invoke/:id", async (req, reply) => {
    const user = await verifyApiKey(req.headers.authorization);
    if (!user)
      return reply
        .code(401)
        .send({ error: "invalid_api_key", message: "invalid api key" });

    const { id } = IdParams.parse(req.params);
    const fn = await getFunction(id, user.id);
    if (!fn)
      return reply.code(404).send({ error: "not_found", message: "function not found" });

    const plan = resolvePlan(user.plan);
    const gate = await enforceInvocation(user.id, plan);
    if (!gate.ok) {
      req.log.warn(
        { userId: user.id, plan: gate.plan, code: gate.code, limit: gate.limit },
        "invocation denied",
      );
      return reply
        .code(gate.status)
        .header("retry-after", String(denialRetryAfterSeconds(gate)))
        .send(denialBody(gate));
    }

    const request = buildRequestFromFastify(req);
    const started = new Date();
    let result: ExecResult;
    const runnable = runnableCode(fn);
    if (!runnable.ok) {
      gate.release();
      return reply
        .code(409)
        .send({ error: "build_required", message: runnable.error });
    }
    try {
      result = await execute(runnable.code, { request, timeoutMs: gate.limits.timeoutMs });
    } finally {
      gate.release();
    }
    if (result.status === "timeout") {
      req.log.warn(
        { userId: user.id, plan, functionId: fn.id, timeoutMs: gate.limits.timeoutMs },
        "invocation timed out",
      );
    }
    if (gate.isOverage) {
      req.log.info(
        { userId: user.id, plan, functionId: fn.id },
        "invocation counted as overage",
      );
    }
    const completed = new Date();
    const persisted = extractPersistedRun(result);

    const inv = await insertInvocation({
      function_id: fn.id,
      function_version_id: fn.current_version_id,
      user_id: user.id,
      source: "api",
      input: req.body ?? null,
      output: persisted.output,
      logs: result.logs,
      status: persisted.status,
      duration_ms: result.duration_ms,
      error_message: persisted.error_message,
      started_at: started,
      completed_at: completed,
      trigger_kind: "http",
      request_method: request.method,
      request_path: request.path,
      request_headers: limitHeaderPreview(request.headers),
      response_status: persisted.response_status,
      response_headers: persisted.response_headers,
      response_body_preview: persisted.response_body_preview,
    });

    return formatEditorResponse(inv!.id, result);
  });
}
