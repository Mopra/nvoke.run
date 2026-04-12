import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import * as Q from "../queries/functions.js";

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(100_000),
});
const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(100_000).optional(),
});
const IdParams = z.object({ id: z.string().uuid() });

export async function functionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions", async (req) => {
    return { functions: await Q.listFunctions(req.user!.id) };
  });

  app.post("/api/functions", async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const fn = await Q.createFunction(req.user!.id, body.name, body.code);
    return reply.code(201).send({ function: fn });
  });

  app.get("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const fn = await Q.getFunction(id, req.user!.id);
    if (!fn) return reply.code(404).send({ error: "not found" });
    return { function: fn };
  });

  app.put("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = UpdateBody.parse(req.body);
    const fn = await Q.updateFunction(id, req.user!.id, body);
    if (!fn) return reply.code(404).send({ error: "not found" });
    return { function: fn };
  });

  app.delete("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await Q.deleteFunction(id, req.user!.id);
    return reply.code(204).send();
  });
}
