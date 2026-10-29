// Public, unauthenticated reads: the plan ladder and the OpenAPI document.

import type { FastifyInstance } from 'fastify';
import { PLAN_ORDER, PLANS, type PlansResponse } from '@nvoke/shared';
import { buildOpenApi } from '../openapi.js';
import type { RouteContext } from './context.js';

export async function metaRoutes(app: FastifyInstance, opts: { apiUrl: string }): Promise<void> {
  const openapi = buildOpenApi(opts.apiUrl);

  app.get('/plans', async (): Promise<PlansResponse> => ({
    plans: PLAN_ORDER.map((key) => ({ key, ...PLANS[key] })),
  }));

  app.get('/openapi.json', async (_req, reply) => reply.header('cache-control', 'public, max-age=300').send(openapi));
}

export async function registerMeta(app: FastifyInstance, { env }: RouteContext): Promise<void> {
  await app.register(metaRoutes, { prefix: '/v1', apiUrl: env.PUBLIC_API_URL });
}
