// Standalone runner executed via: node runner.mjs <user-file-path>
// Stdin: JSON { request, env }
// Stdout: single JSON line { ok, response?, logs, error? }

import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 1 * 1024 * 1024;

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : null;
}

const logs = [];
function makeCtx(env) {
  return {
    log: (...args) => {
      const line = args
        .map((a) => (typeof a === "string" ? a : safeJson(a)))
        .join(" ");
      if (logs.length < 100) logs.push(line.slice(0, 2048));
    },
    env: env ?? {},
  };
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function lowerHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

function normalizeResponse(raw) {
  // Distinguish a full response object from a bare body value.
  const looksLikeResponse =
    isPlainObject(raw) &&
    ("status" in raw || "headers" in raw || "body" in raw);

  let status;
  let headers;
  let body;

  if (looksLikeResponse) {
    status = raw.status ?? 200;
    headers = raw.headers ?? {};
    body = "body" in raw ? raw.body : null;
  } else {
    status = 200;
    headers = {};
    body = raw;
  }

  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`invalid response status: ${String(status)}`);
  }
  if (!isPlainObject(headers)) {
    throw new Error("response headers must be a plain object");
  }
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v !== "string") {
      throw new Error(`header "${k}" must be a string`);
    }
    if (/[\r\n]/.test(v)) {
      throw new Error(`header "${k}" contains unsafe characters`);
    }
    normHeaders[String(k).toLowerCase()] = v;
  }

  // Reject unsupported body kinds.
  if (typeof body === "function" || typeof body === "symbol") {
    throw new Error(`unsupported response body type: ${typeof body}`);
  }
  if (typeof body === "bigint") {
    throw new Error("unsupported response body type: bigint");
  }

  // Serialize body and ensure content-type.
  let serialized;
  if (body === undefined) {
    serialized = looksLikeResponse ? "" : "null";
    if (!("content-type" in normHeaders) && !looksLikeResponse) {
      normHeaders["content-type"] = "application/json; charset=utf-8";
    }
  } else if (typeof body === "string") {
    serialized = body;
    if (!("content-type" in normHeaders)) {
      normHeaders["content-type"] = "text/plain; charset=utf-8";
    }
  } else if (
    typeof body === "number" ||
    typeof body === "boolean" ||
    body === null ||
    isPlainObject(body) ||
    Array.isArray(body)
  ) {
    serialized = JSON.stringify(body);
    if (!("content-type" in normHeaders)) {
      normHeaders["content-type"] = "application/json; charset=utf-8";
    }
  } else {
    throw new Error(`unsupported response body type: ${typeof body}`);
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
    throw new Error("response body exceeds 1MB limit");
  }

  return { status, headers: normHeaders, body: serialized };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("runner: missing file path argv");
  const payload = (await readStdin()) ?? {};
  const request = payload.request ?? {
    method: "POST",
    path: "/",
    query: {},
    headers: {},
    body: null,
  };
  const env = payload.env ?? {};
  const ctx = makeCtx(env);

  const mod = await import(pathToFileURL(filePath).href);
  const fn = mod.default;
  if (typeof fn !== "function") {
    throw new Error("function must export a default async function");
  }
  const raw = await fn(request, ctx);
  const response = normalizeResponse(raw);
  process.stdout.write(JSON.stringify({ ok: true, response, logs }) + "\n");
}

main().catch((e) => {
  const error = e instanceof Error ? e.stack || e.message : String(e);
  process.stdout.write(JSON.stringify({ ok: false, error, logs }) + "\n");
  process.exit(1);
});
