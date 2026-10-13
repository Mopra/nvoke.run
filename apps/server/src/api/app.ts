import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from '../env.js';
import { registerAuth } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { leadsRoutes } from './routes/leads.js';
import { getSql } from '../db/client.js';

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
  await app.register(leadsRoutes, {
    prefix: '/v1',
    getSql,
    // Bridge until the auth work lands: run the Clerk check, then expose the
    // user id the way the lead routes expect it (request.userId).
    authenticate: async (req, reply) => {
      await app.requireAuth(req, reply);
      if (reply.sent) return reply;
      if (req.auth) req.userId = req.auth.userId;
    },
  });

  return app;
}
