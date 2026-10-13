import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import type { Env } from '../env.js';
import { getSql as defaultGetSql } from '../db/client.js';
import { postgresStore, type DesktopAuthStore } from '../auth/store.js';
import { clerkUserDirectory, type UserDirectory } from '../auth/users.js';
import { clerkVerifier, registerAuth, type ClerkVerifier } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { desktopRoutes } from './routes/desktop.js';
import { leadsRoutes } from './routes/leads.js';
import { postgresAccounts, type Accounts } from '../leads/accounts.js';
import { clerkPlanSource } from '../billing/clerk.js';
import { webhookRoutes } from './routes/webhooks.js';

/** Collaborators the routes need. Tests swap in fakes; production uses the defaults. */
export interface AppDeps {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  store: DesktopAuthStore;
  verifyClerk: ClerkVerifier | null;
  users: UserDirectory | null;
  accounts: Accounts;
}

/** Builds the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(env: Env, overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const getSql = overrides.getSql ?? defaultGetSql;
  const deps: Omit<AppDeps, 'accounts'> = {
    getSql,
    store: overrides.store ?? postgresStore(getSql),
    verifyClerk: overrides.verifyClerk !== undefined ? overrides.verifyClerk : clerkVerifier(env),
    users:
      overrides.users !== undefined
        ? overrides.users
        : env.CLERK_SECRET_KEY
          ? clerkUserDirectory(env.CLERK_SECRET_KEY)
          : null,
  };

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
  });

  const accounts =
    overrides.accounts ??
    postgresAccounts(getSql, env.CLERK_SECRET_KEY ? clerkPlanSource(env.CLERK_SECRET_KEY) : null, app.log);

  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: false,
  });

  registerAuth(app, { ...deps, accounts });

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/v1', users: deps.users, accounts });
  await app.register(webhookRoutes, { prefix: '/webhooks', signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET ?? null, accounts });
  await app.register(desktopRoutes, { prefix: '/v1/desktop', store: deps.store });
  // requireAuth sets request.userId; the plugin's requireUser guard reads it.
  await app.register(leadsRoutes, { prefix: '/v1', getSql, authenticate: app.requireAuth });

  return app;
}
