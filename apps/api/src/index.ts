import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { pool } from "./db.js";
import { clerkAuth, registerAuth } from "./auth.js";
import { functionsRoutes } from "./routes/functions.js";
import { invokeRoutes } from "./routes/invoke.js";
import { invocationsRoutes } from "./routes/invocations.js";
import { keysRoutes } from "./routes/keys.js";
import { httpFunctionsRoutes } from "./routes/http-functions.js";
import { billingRoutes } from "./routes/billing.js";

const app = Fastify({ logger: true });

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

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
