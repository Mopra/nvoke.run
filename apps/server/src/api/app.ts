import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from '../env.js';
import { registerAuth } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';

/** Builds the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: false,
  });

  registerAuth(app, env);

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/v1' });

  return app;
}
