import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { listInvocations, getInvocation, listAllInvocations } from "../queries/invocations.js";

const FnParams = z.object({ id: z.string().uuid() });
const InvParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  status: z.enum(["success", "error", "timeout"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function invocationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions/:id/invocations", async (req) => {
    const { id } = FnParams.parse(req.params);
    const { status, limit } = ListQuery.parse(req.query);
    const rows = await listInvocations(id, req.user!.id, { status, limit });
    return {
      invocations: rows.map((r) => ({
        id: r.id,
        function_id: r.function_id,
        function_version_id: r.function_version_id,
        version_number: r.version_number,
        source: r.source,
        status: r.status,
        duration_ms: r.duration_ms,
        started_at: r.started_at,
        completed_at: r.completed_at,
        trigger_kind: r.trigger_kind,
        request_method: r.request_method,
        request_path: r.request_path,
        response_status: r.response_status,
      })),
    };
  });

  app.get("/api/invocations", async (req) => {
    const { status, limit } = ListQuery.parse(req.query);
    const rows = await listAllInvocations(req.user!.id, { status, limit });
    return {
      invocations: rows.map((r) => ({
        id: r.id,
        function_id: r.function_id,
        function_name: r.function_name,
        function_version_id: r.function_version_id,
        version_number: r.version_number,
        source: r.source,
        status: r.status,
        duration_ms: r.duration_ms,
        started_at: r.started_at,
        completed_at: r.completed_at,
        trigger_kind: r.trigger_kind,
        request_method: r.request_method,
        request_path: r.request_path,
        response_status: r.response_status,
      })),
    };
  });

  app.get("/api/invocations/:id", async (req, reply) => {
    const { id } = InvParams.parse(req.params);
    const row = await getInvocation(id, req.user!.id);
    if (!row)
      return reply.code(404).send({ error: "not_found", message: "invocation not found" });
    return { invocation: row };
  });
}
