import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getFunctionBySlug,
  getWebhookVerifyConfig,
  runnableCode,
  type HttpMethod,
} from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { insertTriggerEvent } from "../queries/trigger-events.js";
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
import { decryptSecret } from "../secrets-crypto.js";
import { verifyWebhookSignature } from "../webhook-verify.js";

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

  if (fn.webhook_verify_kind !== "none") {
    const config = await getWebhookVerifyConfig(fn.id);
    if (!config || !config.secret_ct) {
      return reply.code(503).send({
        error: "webhook_not_configured",
        message: "webhook verification is enabled but no secret is configured",
      });
    }
    const headersLower: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      headersLower[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    }
    const rawBody =
      (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
    let secret: string;
    try {
      secret = decryptSecret(config.secret_ct);
    } catch (e) {
      req.log.error({ err: e, functionId: fn.id }, "webhook secret decrypt failed");
      return reply.code(500).send({
        error: "webhook_decrypt_failed",
        message: "could not decrypt webhook secret",
      });
    }
    const result = verifyWebhookSignature({
      kind: config.kind,
      secret,
      signatureHeader: config.signature_header,
      rawBody,
      headers: headersLower,
    });
    if (!result.ok) {
      await insertTriggerEvent({
        function_id: fn.id,
        user_id: fn.user_id,
        kind: "webhook_rejected",
        outcome: "error",
        message: result.reason,
        details: { kind: config.kind, path: req.url },
      });
      return reply
        .code(401)
        .send({ error: "invalid_signature", message: "webhook signature verification failed" });
    }
    await insertTriggerEvent({
      function_id: fn.id,
      user_id: fn.user_id,
      kind: "webhook_received",
      outcome: "ok",
      details: { kind: config.kind },
    });
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
  // Preserve raw body on the request so webhook signature verification can
  // hash the exact bytes the sender signed. Scoped to this plugin, so other
  // routes keep the default parsers.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody =
        typeof body === "string" ? body : body.toString("utf8");
      try {
        const text = typeof body === "string" ? body : body.toString("utf8");
        done(null, text.length === 0 ? null : JSON.parse(text));
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );
  app.addContentTypeParser(
    "*",
    { parseAs: "string" },
    (req, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody =
        typeof body === "string" ? body : body.toString("utf8");
      done(null, body);
    },
  );

  app.route({
    method: METHODS,
    url: "/f/:slug",
    handler,
  });
}
