import { verifyToken } from '@clerk/backend';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env.js';
import { isDeviceToken, resolveDeviceToken } from '../auth/desktop.js';
import type { DesktopAuthStore } from '../auth/store.js';
import type { Accounts } from '../leads/accounts.js';
import './user.js';

export interface AuthContext {
  userId: string;
  /** `device`: a desktop device token. `clerk`: a Clerk session JWT (the site). */
  via: 'device' | 'clerk';
  /** Clerk session id, for `clerk` auth. */
  sessionId: string | null;
  /** device_sessions.id, for `device` auth. */
  deviceSessionId: string | null;
}

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** Accepts a desktop device token or a Clerk session JWT. */
    requireAuth: PreHandler;
    /** Accepts only a Clerk session JWT, for routes the site calls in the browser. */
    requireClerkSession: PreHandler;
    /** Accepts only a desktop device token. */
    requireDeviceSession: PreHandler;
  }
}

/** Verifies a Clerk session JWT and returns its user and session ids. */
export type ClerkVerifier = (token: string) => Promise<{ userId: string; sessionId: string | null }>;

export function clerkVerifier(env: Env): ClerkVerifier | null {
  if (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) return null;
  return async (token) => {
    // Local verification when CLERK_JWT_KEY is set, otherwise Clerk's JWKS is
    // fetched with CLERK_SECRET_KEY and cached by the SDK.
    const claims = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: env.CLERK_AUTHORIZED_PARTIES.length > 0 ? env.CLERK_AUTHORIZED_PARTIES : undefined,
      clockSkewInMs: 10_000,
    });
    return { userId: claims.sub, sessionId: typeof claims.sid === 'string' ? claims.sid : null };
  };
}

/**
 * Callers send `Authorization: Bearer <token>`. The desktop app sends an opaque
 * device token (prefix `nvk_dt_`, looked up by sha256 in device_sessions). The
 * site sends a Clerk session JWT. Either way the preHandler sets `req.auth` and
 * `req.userId` (what the lead routes read) and makes sure the user has an
 * accounts row.
 */
export function registerAuth(
  app: FastifyInstance,
  deps: { store: DesktopAuthStore; verifyClerk: ClerkVerifier | null; accounts: Accounts },
): void {
  app.decorateRequest('auth', null);

  async function authenticate(
    req: FastifyRequest,
    reply: FastifyReply,
    accept: { device: boolean; clerk: boolean },
  ): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length).trim();

    if (isDeviceToken(token)) {
      if (!accept.device) return reply.code(401).send({ error: 'device tokens are not accepted here' });
      const session = await resolveDeviceToken(deps.store, token);
      if (!session) return reply.code(401).send({ error: 'invalid token' });
      req.auth = { userId: session.clerkUserId, via: 'device', sessionId: null, deviceSessionId: session.id };
      return signedIn(req, reply);
    }

    if (!accept.clerk) return reply.code(401).send({ error: 'a device token is required' });
    if (!deps.verifyClerk) {
      req.log.error('auth is not configured: set CLERK_SECRET_KEY or CLERK_JWT_KEY');
      return reply.code(503).send({ error: 'auth not configured' });
    }
    try {
      const { userId, sessionId } = await deps.verifyClerk(token);
      req.auth = { userId, via: 'clerk', sessionId, deviceSessionId: null };
    } catch (err) {
      req.log.warn({ err }, 'clerk token verification failed');
      return reply.code(401).send({ error: 'invalid token' });
    }
    return signedIn(req, reply);
  }

  /** Exposes the user id and creates the account on the first authenticated request. */
  async function signedIn(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = req.auth!.userId;
    req.userId = userId;
    try {
      await deps.accounts.ensure(userId);
    } catch (err) {
      if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
        return reply.code(503).send({ error: 'database_unavailable' });
      }
      throw err;
    }
  }

  app.decorate('requireAuth', (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(req, reply, { device: true, clerk: true }),
  );
  app.decorate('requireClerkSession', (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(req, reply, { device: false, clerk: true }),
  );
  app.decorate('requireDeviceSession', (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(req, reply, { device: true, clerk: false }),
  );
}
