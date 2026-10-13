// Public, unauthenticated reads: the plan ladder and the OpenAPI document.

import type { FastifyInstance } from 'fastify';
import { PLAN_ORDER, PLANS, type PlansResponse } from '@nvoke/shared';
import { buildOpenApi } from '../openapi.js';

export async function metaRoutes(app: FastifyInstance, opts: { apiUrl: string }): Promise<void> {
  const openapi = buildOpenApi(opts.apiUrl);

  app.get('/plans', async (): Promise<PlansResponse> => ({
    plans: PLAN_ORDER.map((key) => ({ key, ...PLANS[key] })),
  }));

  app.get('/openapi.json', async (_req, reply) => reply.header('cache-control', 'public, max-age=300').send(openapi));
}
