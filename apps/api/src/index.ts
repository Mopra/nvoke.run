import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { pool } from "./db.js";
import { clerkAuth, registerAuth } from "./auth.js";
import { functionsRoutes } from "./routes/functions.js";
import { invokeRoutes } from "./routes/invoke.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true, credentials: true });
registerAuth(app);
await app.register(functionsRoutes);
await app.register(invokeRoutes);

app.get("/api/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true };
});

app.get("/api/me", { preHandler: clerkAuth }, async (req) => ({ user: req.user }));

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
