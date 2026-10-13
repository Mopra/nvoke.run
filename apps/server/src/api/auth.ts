import { verifyToken } from '@clerk/backend';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env.js';

export interface AuthContext {
  userId: string;
  sessionId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** preHandler that rejects the request unless it carries a valid Clerk session token. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * The desktop app sends its Clerk session token as `Authorization: Bearer <jwt>`.
 * Verification is local when CLERK_JWT_KEY is set, otherwise Clerk's JWKS is
 * fetched with CLERK_SECRET_KEY and cached by the SDK.
 */
export function registerAuth(app: FastifyInstance, env: Env): void {
  app.decorateRequest('auth', null);

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) {
      req.log.error('auth is not configured: set CLERK_SECRET_KEY or CLERK_JWT_KEY');
      return reply.code(503).send({ error: 'auth not configured' });
    }

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }

    try {
      const claims = await verifyToken(header.slice('Bearer '.length), {
        secretKey: env.CLERK_SECRET_KEY,
        jwtKey: env.CLERK_JWT_KEY,
        authorizedParties: env.CLERK_AUTHORIZED_PARTIES.length > 0 ? env.CLERK_AUTHORIZED_PARTIES : undefined,
        clockSkewInMs: 10_000,
      });
      req.auth = { userId: claims.sub, sessionId: typeof claims.sid === 'string' ? claims.sid : null };
    } catch (err) {
      req.log.warn({ err }, 'clerk token verification failed');
      return reply.code(401).send({ error: 'invalid token' });
    }
  });
}
