import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { execute, type ExecResult } from "../executor.js";
import {
  buildRequestFromFastify,
  extractPersistedRun,
  limitHeaderPreview,
  verifyApiKey,
} from "../http-invoke.js";
import { enforceInvocation, denialBody } from "../billing/enforce.js";
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
  app.post(
    "/api/functions/:id/invoke",
    { preHandler: clerkAuth },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const fn = await getFunction(id, req.user!.id);
      if (!fn) return reply.code(404).send({ error: "not found" });

      const gate = await enforceInvocation(req.user!.id, resolvePlan(req.user!.plan));
      if (!gate.ok) return reply.code(gate.status).send(denialBody(gate));

      const request = buildRequestFromFastify(req);
      const started = new Date();
      let result: ExecResult;
      try {
        result = await execute(fn.code, { request, timeoutMs: gate.limits.timeoutMs });
      } finally {
        gate.release();
      }
      const completed = new Date();
      const persisted = extractPersistedRun(result);

      const inv = await insertInvocation({
        function_id: fn.id,
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
  );

  // Legacy API-key invoke route. Kept JSON-wrapped for backward compatibility;
  // new traffic should use the stable /f/:slug endpoints.
  app.post("/api/invoke/:id", async (req, reply) => {
    const user = await verifyApiKey(req.headers.authorization);
    if (!user) return reply.code(401).send({ error: "invalid api key" });

    const { id } = IdParams.parse(req.params);
    const fn = await getFunction(id, user.id);
    if (!fn) return reply.code(404).send({ error: "not found" });

    const gate = await enforceInvocation(user.id, resolvePlan(user.plan));
    if (!gate.ok) return reply.code(gate.status).send(denialBody(gate));

    const request = buildRequestFromFastify(req);
    const started = new Date();
    let result: ExecResult;
    try {
      result = await execute(fn.code, { request, timeoutMs: gate.limits.timeoutMs });
    } finally {
      gate.release();
    }
    const completed = new Date();
    const persisted = extractPersistedRun(result);

    const inv = await insertInvocation({
      function_id: fn.id,
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
      trigger_kind: "editor",
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
