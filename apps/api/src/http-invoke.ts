import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { findByHash, touchKey } from "./queries/keys.js";
import { one } from "./db.js";
import type { User } from "./queries/users.js";
import type { ExecResult, NormalizedHttpRequest } from "./executor.js";

const BODY_PREVIEW_CAP = 4096;
const HEADER_PREVIEW_CAP = 64;

const BLOCKED_RESPONSE_HEADERS = new Set([
  "connection",
  "transfer-encoding",
  "content-length",
  "keep-alive",
]);

export async function verifyApiKey(
  auth: string | undefined,
): Promise<User | null> {
  if (!auth?.startsWith("Bearer nvk_")) return null;
  const raw = auth.slice(7);
  const hash = createHash("sha256").update(raw).digest("hex");
  const key = await findByHash(hash);
  if (!key) return null;
  await touchKey(key.id);
  return await one<User>("SELECT * FROM users WHERE id=$1", [key.user_id]);
}

export function buildRequestFromFastify(req: FastifyRequest): NormalizedHttpRequest {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  const query: Record<string, string | string[]> = {};
  const rawQuery = req.query as Record<string, unknown> | null;
  if (rawQuery && typeof rawQuery === "object") {
    for (const [k, v] of Object.entries(rawQuery)) {
      if (Array.isArray(v)) query[k] = v.map(String);
      else if (v !== undefined && v !== null) query[k] = String(v);
    }
  }
  return {
    method: req.method.toUpperCase(),
    path: req.url.split("?")[0] ?? "/",
    query,
    headers,
    body: req.body ?? null,
  };
}

export function limitHeaderPreview(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(headers).slice(0, HEADER_PREVIEW_CAP);
  for (const k of keys) out[k] = headers[k];
  return out;
}

export function responseBodyPreview(body: string): string {
  if (body.length <= BODY_PREVIEW_CAP) return body;
  return body.slice(0, BODY_PREVIEW_CAP);
}

export function sanitizeResponseHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (BLOCKED_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export interface PersistedRun {
  status: ExecResult["status"];
  error_message: string | null;
  output: unknown;
  response_status: number | null;
  response_headers: Record<string, string> | null;
  response_body_preview: string | null;
}

export function extractPersistedRun(result: ExecResult): PersistedRun {
  if (result.status === "success") {
    let parsed: unknown = result.response.body;
    try {
      parsed = JSON.parse(result.response.body);
    } catch {
      /* non-JSON body */
    }
    return {
      status: "success",
      error_message: null,
      output: parsed,
      response_status: result.response.status,
      response_headers: result.response.headers,
      response_body_preview: responseBodyPreview(result.response.body),
    };
  }
  return {
    status: result.status,
    error_message: (result as { error: string }).error,
    output: null,
    response_status: result.status === "timeout" ? 504 : 500,
    response_headers: null,
    response_body_preview: null,
  };
}
