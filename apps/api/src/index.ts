import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { pool } from "./db.js";
import { clerkAuth, registerAuth } from "./auth.js";
import { functionsRoutes } from "./routes/functions.js";
import { invokeRoutes } from "./routes/invoke.js";
import { invocationsRoutes } from "./routes/invocations.js";
import { keysRoutes } from "./routes/keys.js";
import { httpFunctionsRoutes } from "./routes/http-functions.js";
import { billingRoutes } from "./routes/billing.js";
import { runMigrations } from "./migrate.js";

const app = Fastify({ logger: true });

function defaultCodeForStatus(status: number): string {
  if (status === 400) return "invalid_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 405) return "method_not_allowed";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 504) return "timeout";
  return status >= 500 ? "internal_error" : "request_failed";
}

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    req.log.error({ err }, "unhandled error");
  } else {
    req.log.warn({ err: err.message, status }, "request error");
  }
  const code = (err as { code?: string }).code ?? defaultCodeForStatus(status);
  const message = status >= 500 ? "internal server error" : err.message || "request failed";
  reply.status(status).send({ error: code, message });
});

app.setNotFoundHandler((_req, reply) => {
  reply.status(404).send({ error: "not_found", message: "resource not found" });
});

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  allowList: (req) => req.url === "/api/health",
});

const corsOrigin = config.WEB_ORIGIN
  ? config.WEB_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : true;
await app.register(cors, { origin: corsOrigin, credentials: true });
registerAuth(app);
await app.register(functionsRoutes);
await app.register(invokeRoutes);
await app.register(invocationsRoutes);
await app.register(keysRoutes);
await app.register(httpFunctionsRoutes);
await app.register(billingRoutes);

app.get("/api/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true };
});

app.get("/api/me", { preHandler: clerkAuth }, async (req) => ({ user: req.user }));

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
async function pruneOldInvocations() {
  try {
    const res = await pool.query(
      "DELETE FROM invocations WHERE started_at < now() - interval '1 day'",
    );
    if (res.rowCount) app.log.info({ deleted: res.rowCount }, "pruned old invocations");
  } catch (err) {
    app.log.error({ err }, "invocation prune failed");
  }
}
void pruneOldInvocations();
setInterval(pruneOldInvocations, RETENTION_INTERVAL_MS).unref();

try {
  const applied = await runMigrations((msg) => app.log.info(msg));
  app.log.info({ applied }, "migrations checked");
} catch (err) {
  app.log.error({ err }, "migration failed on boot");
  process.exit(1);
}

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
