import type { FastifyReply, FastifyRequest } from 'fastify';

// The authenticated user id, set by the upstream auth preHandler (Clerk
// session JWT or device token). The lead routes only read it.
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

/** preHandler that answers 401 unless an earlier hook set request.userId. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (typeof req.userId !== 'string' || req.userId.length === 0) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}
