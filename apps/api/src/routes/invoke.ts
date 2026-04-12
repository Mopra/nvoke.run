import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction } from "../queries/functions.js";
import { insertInvocation } from "../queries/invocations.js";
import { execute } from "../executor.js";

const IdParams = z.object({ id: z.string().uuid() });

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

      return {
        invocation_id: inv!.id,
        status: result.status,
        output: result.status === "success" ? result.output : null,
        logs: result.logs,
        error: result.status === "success" ? null : (result as { error: string }).error,
        duration_ms: result.duration_ms,
      };
    },
  );
}
