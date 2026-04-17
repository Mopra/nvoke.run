import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import { getFunction } from "../queries/functions.js";
import * as Q from "../queries/secrets.js";

const SecretName = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "name must start with a letter or underscore and contain only letters, digits, or underscores",
  );

const SecretValue = z.string().min(1).max(8192);

const IdParams = z.object({ id: z.string().uuid() });
const PairParams = z.object({
  id: z.string().uuid(),
  secretId: z.string().uuid(),
});

const CreateBody = z.object({ name: SecretName, value: SecretValue });
const UpdateBody = z
  .object({ name: SecretName.optional(), value: SecretValue.optional() })
  .refine((v) => v.name !== undefined || v.value !== undefined, {
    message: "must provide name or value",
  });

function isUniqueViolation(err: unknown): err is { code: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

export async function secretsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/functions/:id/secrets", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const fn = await getFunction(id, req.user!.id);
    if (!fn)
      return reply
        .code(404)
        .send({ error: "not_found", message: "function not found" });
    const secrets = await Q.listSecrets(id, req.user!.id);
    return { secrets };
  });

  app.post("/api/functions/:id/secrets", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = CreateBody.parse(req.body);
    const fn = await getFunction(id, req.user!.id);
    if (!fn)
      return reply
        .code(404)
        .send({ error: "not_found", message: "function not found" });
    try {
      const secret = await Q.createSecret(id, req.user!.id, body.name, body.value);
      return reply.code(201).send({ secret });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply
          .code(409)
          .send({ error: "name_taken", message: "a secret with this name already exists" });
      }
      throw e;
    }
  });

  app.put("/api/functions/:id/secrets/:secretId", async (req, reply) => {
    const { id, secretId } = PairParams.parse(req.params);
    const body = UpdateBody.parse(req.body);
    try {
      const secret = await Q.updateSecret(secretId, id, req.user!.id, body);
      if (!secret)
        return reply
          .code(404)
          .send({ error: "not_found", message: "secret not found" });
      return { secret };
    } catch (e) {
      if (isUniqueViolation(e)) {
        return reply
          .code(409)
          .send({ error: "name_taken", message: "a secret with this name already exists" });
      }
      throw e;
    }
  });

  app.delete("/api/functions/:id/secrets/:secretId", async (req, reply) => {
    const { id, secretId } = PairParams.parse(req.params);
    await Q.deleteSecret(secretId, id, req.user!.id);
    return reply.code(204).send();
  });
}
