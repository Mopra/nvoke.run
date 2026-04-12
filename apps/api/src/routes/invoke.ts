import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { findByHash, touchKey } from "../queries/keys.js";
import { execute, type ExecResult } from "../executor.js";
import { one } from "../db.js";
import type { User } from "../queries/users.js";

const IdParams = z.object({ id: z.string().uuid() });

async function verifyApiKey(auth: string | undefined): Promise<User | null> {
  if (!auth?.startsWith("Bearer nvk_")) return null;
  const raw = auth.slice(7);
  const hash = createHash("sha256").update(raw).digest("hex");
  const key = await findByHash(hash);
  if (!key) return null;
  await touchKey(key.id);
  return await one<User>("SELECT * FROM users WHERE id=$1", [key.user_id]);
}

function formatResponse(invId: string, result: ExecResult) {
  return {
    invocation_id: invId,
    status: result.status,
    output: result.status === "success" ? result.output : null,
    logs: result.logs,
    error: result.status === "success" ? null : (result as { error: string }).error,
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

      const started = new Date();
      const result = await execute(fn.code, req.body ?? null);
      const completed = new Date();

      const inv = await insertInvocation({
        function_id: fn.id,
        user_id: req.user!.id,
        source: "ui",
        input: req.body ?? null,
        output: result.status === "success" ? result.output : null,
        logs: result.logs,
        status: result.status,
        duration_ms: result.duration_ms,
        error_message:
          result.status === "success" ? null : (result as { error: string }).error,
        started_at: started,
        completed_at: completed,
      });

      return formatResponse(inv!.id, result);
    },
  );

  app.post("/api/invoke/:id", async (req, reply) => {
    const user = await verifyApiKey(req.headers.authorization);
    if (!user) return reply.code(401).send({ error: "invalid api key" });

    const { id } = IdParams.parse(req.params);
    const fn = await getFunction(id, user.id);
    if (!fn) return reply.code(404).send({ error: "not found" });

    const started = new Date();
    const result = await execute(fn.code, req.body ?? null);
    const completed = new Date();

    const inv = await insertInvocation({
      function_id: fn.id,
      user_id: user.id,
      source: "api",
      input: req.body ?? null,
      output: result.status === "success" ? result.output : null,
      logs: result.logs,
      status: result.status,
      duration_ms: result.duration_ms,
      error_message:
        result.status === "success" ? null : (result as { error: string }).error,
      started_at: started,
      completed_at: completed,
    });

    return formatResponse(inv!.id, result);
  });
}
