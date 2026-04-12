import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { listInvocations, getInvocation } from "../queries/invocations.js";

const FnParams = z.object({ id: z.string().uuid() });
const InvParams = z.object({ id: z.string().uuid() });

export async function invocationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions/:id/invocations", async (req) => {
    const { id } = FnParams.parse(req.params);
    const rows = await listInvocations(id, req.user!.id);
    return {
      invocations: rows.map((r) => ({
        id: r.id,
        function_id: r.function_id,
        source: r.source,
        status: r.status,
        duration_ms: r.duration_ms,
        started_at: r.started_at,
        completed_at: r.completed_at,
      })),
    };
  });

  app.get("/api/invocations/:id", async (req, reply) => {
    const { id } = InvParams.parse(req.params);
    const row = await getInvocation(id, req.user!.id);
    if (!row) return reply.code(404).send({ error: "not found" });
    return { invocation: row };
  });
}
