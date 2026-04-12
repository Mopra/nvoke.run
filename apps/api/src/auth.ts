import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "./config.js";
import { upsertUser, type User } from "./queries/users.js";

const clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY });

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export async function clerkAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing bearer token" });
  }
  const token = header.slice(7);
  let claims: { sub: string };
  try {
    claims = await verifyToken(token, { secretKey: config.CLERK_SECRET_KEY });
  } catch {
    return reply.code(401).send({ error: "invalid token" });
  }
  const clerkUser = await clerk.users.getUser(claims.sub);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? `${claims.sub}@unknown`;
  req.user = await upsertUser(claims.sub, email);
}

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest("user", null);
}
