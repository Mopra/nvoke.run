import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from '../env.js';
import { getSql } from '../db/client.js';
import { postgresStore, type DesktopAuthStore } from '../auth/store.js';
import { clerkUserDirectory, type UserDirectory } from '../auth/users.js';
import { clerkVerifier, registerAuth, type ClerkVerifier } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { desktopRoutes } from './routes/desktop.js';

/** Collaborators the routes need. Tests swap in fakes; production uses the defaults. */
export interface AppDeps {
  store: DesktopAuthStore;
  verifyClerk: ClerkVerifier | null;
  users: UserDirectory | null;
}

/** Builds the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(env: Env, overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const deps: AppDeps = {
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

  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: false,
  });

  registerAuth(app, deps);

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/v1', users: deps.users });
  await app.register(desktopRoutes, { prefix: '/v1/desktop', store: deps.store });

  return app;
}
