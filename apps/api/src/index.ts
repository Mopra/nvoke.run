import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { pool } from "./db.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true, credentials: true });

app.get("/api/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true };
});

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
