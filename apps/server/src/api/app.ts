import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import type { Env } from '../env.js';
import { getSql as defaultGetSql } from '../db/client.js';
import { postgresStore, type DesktopAuthStore } from '../auth/store.js';
import { clerkUserDirectory, type UserDirectory } from '../auth/users.js';
import { clerkOAuthVerifier, clerkVerifier, registerAuth, type ClerkVerifier, type OAuthVerifier } from './auth.js';
import { postgresAccounts, type Accounts } from '../leads/accounts.js';
import { clerkPlanSource } from '../billing/clerk.js';
import type { Resolve } from '../webhooks/address.js';
import { createAiFromEnv, type Ai } from '../ai/client.js';
import { createSecrets, type Secrets } from '../crypto/secrets.js';
import type { RouteContext } from './routes/context.js';
import { routes, type RouteOverrides } from './routes/index.js';

/** Collaborators shared by auth and several route groups. */
interface SharedDeps {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  store: DesktopAuthStore;
  verifyClerk: ClerkVerifier | null;
  users: UserDirectory | null;
  accounts: Accounts;
  verifyOAuth: OAuthVerifier | null;
  /** DNS for checking webhook URLs and the site profile's website. Tests stub it out. */
  webhookResolve?: Resolve;
  /** Claude. Tests pass one built on a fake client. */
  ai?: Ai;
  /** Seals mailbox passwords and signs unsubscribe links. Null switches sending off. */
  secrets?: Secrets | null;
}

/**
 * Collaborators the routes need. Tests swap in fakes; production uses the
 * defaults. Each route group declares its own overrides in its routes file.
 */
export type AppDeps = SharedDeps & RouteOverrides;

/** Builds the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(env: Env, overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const getSql = overrides.getSql ?? defaultGetSql;
  const store = overrides.store ?? postgresStore(getSql);
  const verifyClerk = overrides.verifyClerk !== undefined ? overrides.verifyClerk : clerkVerifier(env);
  const users =
    overrides.users !== undefined
      ? overrides.users
      : env.CLERK_SECRET_KEY
        ? clerkUserDirectory(env.CLERK_SECRET_KEY)
        : null;
  const verifyOAuth = overrides.verifyOAuth !== undefined ? overrides.verifyOAuth : clerkOAuthVerifier(env);

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    // Production sits behind Coolify's Traefik on the docker bridge
    // (deploy/README.md), so request.ip comes from X-Forwarded-For only when
    // the socket peer is a private or loopback address. A direct caller from
    // the internet cannot set its own IP with the header.
    trustProxy: ['loopback', 'uniquelocal'],
  });

  const accounts =
    overrides.accounts ??
    postgresAccounts(getSql, env.CLERK_SECRET_KEY ? clerkPlanSource(env.CLERK_SECRET_KEY) : null, app.log);

  // The web app on the site calls every /v1 route from the browser, deleting
  // searches and revoking keys included, so DELETE and PATCH must pass too.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    credentials: false,
  });

  registerAuth(app, { getSql, store, verifyClerk, verifyOAuth, accounts });

  // Fastify's logger is pino underneath; its type only leaves out a few members.
  const log = app.log as unknown as Logger;
  let ai = overrides.ai;
  const ctx: RouteContext<RouteOverrides> = {
    env,
    getSql,
    log,
    store,
    users,
    accounts,
    getAi: () => (ai ??= createAiFromEnv(getSql(), log)),
    urlPolicy: { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE },
    resolve: overrides.webhookResolve,
    secrets: overrides.secrets !== undefined ? overrides.secrets : env.SECRETS_KEY ? createSecrets(env.SECRETS_KEY) : null,
    overrides,
  };
  for (const register of routes) await register(app, ctx);

  return app;
}
