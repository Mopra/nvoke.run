import type { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { clerkAuth } from "../auth.js";
import * as Q from "../queries/keys.js";

const CreateBody = z.object({ name: z.string().min(1).max(100) });
const IdParams = z.object({ id: z.string().uuid() });

export async function keysRoutes(app: FastifyInstance) {
  app.addHook("preHandler", clerkAuth);

  app.get("/api/keys", async (req) => {
    const keys = await Q.listKeys(req.user!.id);
    return { keys };
  });

  app.post("/api/keys", async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const raw = "nvk_" + randomBytes(24).toString("hex");
    const hash = createHash("sha256").update(raw).digest("hex");
    const prefix = raw.slice(0, 12);
    const key = await Q.insertKey(req.user!.id, body.name, prefix, hash);
    return reply.code(201).send({
      key: {
        id: key!.id,
        name: key!.name,
        prefix: key!.prefix,
        created_at: key!.created_at,
      },
      raw_key: raw,
    });
  });

  app.delete("/api/keys/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await Q.deleteKey(id, req.user!.id);
    return reply.code(204).send();
  });
}
