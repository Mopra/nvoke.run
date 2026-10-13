import { createHash } from 'node:crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import type { Env } from '../env.js';
import { isApiKey, resolveApiKey } from '../auth/api-keys.js';
import { isDeviceToken, resolveDeviceToken } from '../auth/desktop.js';
import type { DesktopAuthStore } from '../auth/store.js';
import type { Accounts } from '../leads/accounts.js';
import './user.js';

export interface AuthContext {
  userId: string;
  /**
   * `device`: a desktop device token. `clerk`: a Clerk session JWT (the site).
   * `api_key`: an nvk_sk_ key. `oauth`: a Clerk OAuth access token (MCP clients).
   */
  via: 'device' | 'clerk' | 'api_key' | 'oauth';
  /** Clerk session id, for `clerk` auth. */
  sessionId: string | null;
  /** device_sessions.id, for `device` auth. */
  deviceSessionId: string | null;
  /** api_keys.id, for `api_key` auth. */
  apiKeyId: string | null;
}

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /**
     * Set on the claim route: a Clerk session there must not claim the
     * account on its own (see `humanSignedIn` in leads/accounts.ts).
     */
    claimRoute?: boolean;
  }
  interface FastifyInstance {
    /** Accepts any credential: device token, API key, Clerk session JWT or Clerk OAuth token. */
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

/** Verifies a Clerk OAuth access token (what MCP clients get from Clerk) and returns its user. */
export type OAuthVerifier = (token: string) => Promise<{ userId: string }>;

const OAUTH_CACHE_MS = 60_000;

/** Verifies with the Clerk Backend API, cached for a minute per token. */
export function clerkOAuthVerifier(env: Env): OAuthVerifier | null {
  if (!env.CLERK_SECRET_KEY) return null;
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const cache = new Map<string, { at: number; userId: string }>();
  return async (token) => {
    const key = createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < OAUTH_CACHE_MS) return { userId: hit.userId };
    const verified = await clerk.idPOAuthAccessToken.verify(token);
    if (verified.revoked || verified.expired || !verified.subject) throw new Error('oauth token is not live');
    if (cache.size > 10_000) cache.clear();
    cache.set(key, { at: Date.now(), userId: verified.subject });
    return { userId: verified.subject };
  };
}

/** True when the token looks like a JWT (three dot separated parts). */
function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export interface AuthDeps {
  store: DesktopAuthStore;
  verifyClerk: ClerkVerifier | null;
  verifyOAuth: OAuthVerifier | null;
  accounts: Accounts;
  getSql: () => Sql;
}

type Accept = { device: boolean; clerk: boolean; apiKey: boolean; oauth: boolean };

/**
 * Callers send `Authorization: Bearer <token>`:
 *
 * - `nvk_dt_...`: the desktop app's device token, looked up by sha256 in device_sessions.
 * - `nvk_sk_...`: an API key, looked up by sha256 in api_keys.
 * - a Clerk session JWT: the site.
 * - anything else: a Clerk OAuth access token, which MCP clients get through
 *   Clerk's OAuth flow (see routes/mcp.ts).
 *
 * The preHandler sets `req.auth` and `req.userId` (what the lead routes read)
 * and makes sure the user has an accounts row.
 */
export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  app.decorateRequest('auth', null);

  async function authenticate(req: FastifyRequest, reply: FastifyReply, accept: Accept): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length).trim();
    const none = { sessionId: null, deviceSessionId: null, apiKeyId: null };

    if (isDeviceToken(token)) {
      if (!accept.device) return reply.code(401).send({ error: 'device tokens are not accepted here' });
      const session = await resolveDeviceToken(deps.store, token);
      if (!session) return reply.code(401).send({ error: 'invalid token' });
      req.auth = { ...none, userId: session.clerkUserId, via: 'device', deviceSessionId: session.id };
      return signedIn(req, reply);
    }

    if (isApiKey(token)) {
      if (!accept.apiKey) return reply.code(401).send({ error: 'api keys are not accepted here' });
      const key = await withDatabase(reply, () => resolveApiKey(deps.getSql(), token));
      if (key === undefined) return;
      if (!key.ok && key.reason === 'claim_required') return reply.code(403).send({ error: 'claim_required' });
      if (!key.ok) return reply.code(401).send({ error: 'invalid token' });
      req.auth = { ...none, userId: key.userId, via: 'api_key', apiKeyId: key.keyId };
      return signedIn(req, reply);
    }

    if (!accept.clerk && !accept.oauth) return reply.code(401).send({ error: 'a device token is required' });
    if (!deps.verifyClerk && !deps.verifyOAuth) {
      req.log.error('auth is not configured: set CLERK_SECRET_KEY or CLERK_JWT_KEY');
      return reply.code(503).send({ error: 'auth not configured' });
    }

    if (accept.clerk && deps.verifyClerk && looksLikeJwt(token)) {
      try {
        const { userId, sessionId } = await deps.verifyClerk(token);
        req.auth = { ...none, userId, via: 'clerk', sessionId };
        return signedIn(req, reply);
      } catch (err) {
        // Not a session token. It may still be an OAuth token issued as a JWT.
        if (!accept.oauth || !deps.verifyOAuth) {
          req.log.warn({ err }, 'clerk token verification failed');
          return reply.code(401).send({ error: 'invalid token' });
        }
      }
    }

    if (accept.oauth && deps.verifyOAuth) {
      try {
        const { userId } = await deps.verifyOAuth(token);
        req.auth = { ...none, userId, via: 'oauth' };
        return signedIn(req, reply);
      } catch (err) {
        req.log.warn({ err }, 'oauth token verification failed');
      }
    }
    return reply.code(401).send({ error: 'invalid token' });
  }

  /** Runs a database call, answering 503 when there is no database. Undefined means it replied. */
  async function withDatabase<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
        await reply.code(503).send({ error: 'database_unavailable' });
        return undefined;
      }
      throw err;
    }
  }

  /** Exposes the user id and creates the account on the first authenticated request. */
  async function signedIn(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { userId, via } = req.auth!;
    req.userId = userId;
    await withDatabase(reply, async () => {
      await deps.accounts.ensure(userId);
      // A person signing in to the site or the desktop app proves they own
      // the email. If an agent made the account, that claims it, except on
      // the claim page, where they choose what happens to the agent's key.
      if ((via === 'clerk' || via === 'device') && !req.routeOptions.config?.claimRoute) {
        await deps.accounts.humanSignedIn(userId);
      }
    });
  }

  const all: Accept = { device: true, clerk: true, apiKey: true, oauth: true };
  app.decorate('requireAuth', (req: FastifyRequest, reply: FastifyReply) => authenticate(req, reply, all));
  app.decorate('requireClerkSession', (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(req, reply, { device: false, clerk: true, apiKey: false, oauth: false }),
  );
  app.decorate('requireDeviceSession', (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(req, reply, { device: true, clerk: false, apiKey: false, oauth: false }),
  );
}
