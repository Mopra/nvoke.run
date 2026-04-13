import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getFunctionBySlug, type HttpMethod } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { execute } from "../executor.js";
import {
  buildRequestFromFastify,
  extractPersistedRun,
  limitHeaderPreview,
  sanitizeResponseHeaders,
  verifyApiKey,
} from "../http-invoke.js";

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
  if (!fn || !fn.enabled) return reply.code(404).send({ error: "not found" });

  const method = req.method.toUpperCase() as HttpMethod;
  if (!fn.methods.includes(method)) {
    return reply
      .code(405)
      .header("allow", fn.methods.join(", "))
      .send({ error: "method not allowed" });
  }

  let userId = fn.user_id;
  if (fn.access_mode === "api_key") {
    const user = await verifyApiKey(req.headers.authorization);
    if (!user || user.id !== fn.user_id) {
      return reply.code(401).send({ error: "invalid api key" });
    }
    userId = user.id;
  }

  const request = buildRequestFromFastify(req);
  const started = new Date();
  const result = await execute(fn.code, { request });
  const completed = new Date();
  const persisted = extractPersistedRun(result);

  await insertInvocation({
    function_id: fn.id,
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
  return reply.send(
    JSON.stringify({ error: result.status === "timeout" ? "timeout" : "function error" }),
  );
}

export async function httpFunctionsRoutes(app: FastifyInstance) {
  app.route({
    method: METHODS,
    url: "/f/:slug",
    handler,
  });
}
