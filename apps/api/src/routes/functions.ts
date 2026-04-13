import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import * as Q from "../queries/functions.js";
import { SUPPORTED_METHODS } from "../queries/functions.js";

const MethodEnum = z.enum(SUPPORTED_METHODS);
const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric with dashes");

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(100_000),
  slug: Slug.optional(),
  access_mode: z.enum(["public", "api_key"]).optional(),
  enabled: z.boolean().optional(),
  methods: z.array(MethodEnum).min(1).optional(),
});
const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(100_000).optional(),
  slug: Slug.nullable().optional(),
  access_mode: z.enum(["public", "api_key"]).optional(),
  enabled: z.boolean().optional(),
  methods: z.array(MethodEnum).min(1).optional(),
});
const IdParams = z.object({ id: z.string().uuid() });

function isUniqueViolation(err: unknown): err is { code: string } {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function functionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions", async (req) => {
    return { functions: await Q.listFunctions(req.user!.id) };
  });

  app.post("/api/functions", async (req, reply) => {
    const body = CreateBody.parse(req.body);
    try {
      const fn = await Q.createFunction(req.user!.id, body);
      return reply.code(201).send({ function: fn });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply.code(409).send({ error: "slug already in use" });
      }
      throw e;
    }
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
    try {
      const fn = await Q.updateFunction(id, req.user!.id, body);
      if (!fn) return reply.code(404).send({ error: "not found" });
      return { function: fn };
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply.code(409).send({ error: "slug already in use" });
      }
      throw e;
    }
  });

  app.delete("/api/functions/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await Q.deleteFunction(id, req.user!.id);
    return reply.code(204).send();
  });
}
