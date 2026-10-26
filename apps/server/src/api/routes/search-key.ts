// Your own search key (docs/SPEC.md, "Your own search key"): read, save and
// delete the account's Serper or Brave key. Saving tries the key with one
// search, billed to it, before it is kept. The key is sealed with SECRETS_KEY
// and only its last 4 characters come back.

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { SaveSearchKeyRequest } from '@nvoke/shared';
import type { Secrets } from '../../crypto/secrets.js';
import { deleteSearchKey, getSearchKey, saveSearchKey, type OwnSearchKey } from '../../leads/search-keys.js';
import { checkSearchKey, type SearchKeyCheck } from '../../leads/sources/own-search.js';
import { requireUser } from '../user.js';

export interface SearchKeyRoutesOptions {
  getSql: () => Sql;
  /** Upstream auth that sets request.userId (app.requireAuth). */
  authenticate: preHandlerAsyncHookHandler;
  /** Seals the key. Without SECRETS_KEY no key can be stored. */
  secrets: Secrets | null;
  /** Tests replace the one search that tries the key. */
  check?: (key: OwnSearchKey) => Promise<SearchKeyCheck>;
}

export async function searchKeyRoutes(app: FastifyInstance, opts: SearchKeyRoutesOptions): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'search key route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });
  app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);

  app.get('/', async (req, reply) => {
    const key = await getSearchKey(opts.getSql(), req.userId!);
    if (!key) return reply.code(404).send({ error: 'not_found' });
    return key;
  });

  app.post('/', async (req, reply) => {
    const body = SaveSearchKeyRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    if (!opts.secrets) return reply.code(503).send({ error: 'source_unavailable' });
    const key: OwnSearchKey = { provider: body.data.provider, apiKey: body.data.apiKey };

    const check = await (opts.check ?? ((k: OwnSearchKey) => checkSearchKey(k, { log: req.log as unknown as Logger })))(key);
    if (!check.ok) {
      if (check.code === 'source_unavailable') return reply.code(503).send({ error: check.code });
      return reply.code(400).send({ error: check.code, detail: check.detail });
    }

    const saved = await saveSearchKey(opts.getSql(), opts.secrets, req.userId!, key);
    req.log.info({ userId: req.userId, provider: key.provider }, 'search key saved');
    return saved;
  });

  app.delete('/', async (req, reply) => {
    if (!(await deleteSearchKey(opts.getSql(), req.userId!))) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
