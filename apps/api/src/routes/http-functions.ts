import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getFunctionBySlug, runnableCode, type HttpMethod } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { loadSecretEnv } from "../queries/secrets.js";
import { execute, type ExecResult } from "../executor.js";
import {
  buildRequestFromFastify,
  extractPersistedRun,
  limitHeaderPreview,
  sanitizeResponseHeaders,
  verifyApiKey,
} from "../http-invoke.js";
import {
  enforceInvocation,
  denialBody,
  denialRetryAfterSeconds,
} from "../billing/enforce.js";
import { resolvePlan } from "../billing/plan-limits.js";
import { getUserPlan } from "../queries/users.js";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

async function handler(req: FastifyRequest, reply: FastifyReply) {
  const { slug } = req.params as { slug: string };
  const fn = await getFunctionBySlug(slug);
  if (!fn || !fn.enabled)
    return reply.code(404).send({ error: "not_found", message: "function not found" });

  const method = req.method.toUpperCase() as HttpMethod;
  if (!fn.methods.includes(method)) {
    return reply
      .code(405)
      .header("allow", fn.methods.join(", "))
      .send({ error: "method_not_allowed", message: "method not allowed on this function" });
  }

  let userId = fn.user_id;
  let plan = resolvePlan(undefined);
  if (fn.access_mode === "api_key") {
    const user = await verifyApiKey(req.headers.authorization);
    if (!user) {
      return reply
        .code(401)
        .send({ error: "invalid_api_key", message: "invalid api key" });
    }
    if (user.id !== fn.user_id) {
      return reply
        .code(403)
        .send({ error: "forbidden", message: "api key does not own this function" });
    }
    userId = user.id;
    plan = resolvePlan(user.plan);
  } else {
    plan = await getUserPlan(fn.user_id);
  }

  const gate = await enforceInvocation(userId, plan);
  if (!gate.ok) {
    req.log.warn(
      { userId, plan: gate.plan, code: gate.code, limit: gate.limit, slug },
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
      .code(503)
      .header("content-type", "application/json; charset=utf-8")
      .send({ error: "build_required", message: runnable.error });
  }
  try {
    result = await execute(runnable.code, { request, env, timeoutMs: gate.limits.timeoutMs });
  } finally {
    gate.release();
  }
  if (result.status === "timeout") {
    req.log.warn(
      { userId, plan, functionId: fn.id, timeoutMs: gate.limits.timeoutMs },
      "invocation timed out",
    );
  }
  if (gate.isOverage) {
    req.log.info(
      { userId, plan, functionId: fn.id },
      "invocation counted as overage",
    );
  }
  const completed = new Date();
  const persisted = extractPersistedRun(result);

  await insertInvocation({
    function_id: fn.id,
    function_version_id: fn.current_version_id,
    user_id: userId,
    source: fn.access_mode === "public" ? "api" : "api",
    input: request.body ?? null,
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

  if (result.status === "success") {
    const safeHeaders = sanitizeResponseHeaders(result.response.headers);
    reply.code(result.response.status);
    for (const [k, v] of Object.entries(safeHeaders)) reply.header(k, v);
    return reply.send(result.response.body);
  }

  reply.code(result.status === "timeout" ? 504 : 500);
  reply.header("content-type", "application/json; charset=utf-8");
  const payload =
    result.status === "timeout"
      ? { error: "timeout", message: "function execution timed out" }
      : { error: "function_error", message: "function threw an error" };
  return reply.send(JSON.stringify(payload));
}

export async function httpFunctionsRoutes(app: FastifyInstance) {
  app.route({
    method: METHODS,
    url: "/f/:slug",
    handler,
  });
}
