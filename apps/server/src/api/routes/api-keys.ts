// API key management (docs/SPEC.md, "API and agents"). Any credential may
// manage keys, an API key included, so an agent can rotate its own.

import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { ApiKeyIdParams, CreateApiKeyRequest, UpdateApiKeyRequest, type ApiKey, type ApiKeyListResponse } from '@nvoke/shared';
import { createApiKey, getApiKey, listApiKeys, renameApiKey, revokeApiKey } from '../../auth/api-keys.js';

export async function apiKeyRoutes(app: FastifyInstance, opts: { getSql: () => Sql }): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'api key route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req): Promise<ApiKeyListResponse> => ({ apiKeys: await listApiKeys(opts.getSql(), req.userId!) }));

  app.post('/', async (req, reply) => {
    const body = CreateApiKeyRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const key = await createApiKey(opts.getSql(), req.userId!, { name: body.data.name });
    if (!key) return reply.code(409).send({ error: 'api_key_limit' });
    return reply.code(201).header('cache-control', 'no-store').send(key);
  });

  app.get('/:id', async (req, reply): Promise<ApiKey | void> => {
    const params = ApiKeyIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const key = await getApiKey(opts.getSql(), req.userId!, params.data.id);
    return key ?? reply.code(404).send({ error: 'not_found' });
  });

  app.patch('/:id', async (req, reply): Promise<ApiKey | void> => {
    const params = ApiKeyIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const body = UpdateApiKeyRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const key = await renameApiKey(opts.getSql(), req.userId!, params.data.id, body.data.name);
    return key ?? reply.code(404).send({ error: 'not_found' });
  });

  app.delete('/:id', async (req, reply) => {
    const params = ApiKeyIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!(await revokeApiKey(opts.getSql(), req.userId!, params.data.id))) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
