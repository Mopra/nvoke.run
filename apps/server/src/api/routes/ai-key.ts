// Your own Claude key (docs/SPEC.md, "Your own Claude key"): read, save and
// delete the account's Anthropic API key and the model for each tier. Saving
// checks the key and both models with Anthropic first (the Models API, free).
// The key is sealed with SECRETS_KEY and only its last 4 characters come back.

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import { SaveAiKeyRequest } from '@nvoke/shared';
import { anthropicSdk, checkKey, type AnthropicSdk } from '../../ai/anthropic.js';
import { deleteAiKey, getAiKey, saveAiKey } from '../../ai/keys.js';
import type { Secrets } from '../../crypto/secrets.js';
import { requireUser } from '../user.js';

export interface AiKeyRoutesOptions {
  getSql: () => Sql;
  /** Upstream auth that sets request.userId (app.requireAuth). */
  authenticate: preHandlerAsyncHookHandler;
  /** Seals the key. Without SECRETS_KEY no key can be stored. */
  secrets: Secrets | null;
  /** Tests replace the Anthropic SDK. */
  sdk?: (apiKey: string) => AnthropicSdk;
}

export async function aiKeyRoutes(app: FastifyInstance, opts: AiKeyRoutesOptions): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'ai key route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });
  app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);
  const sdk = opts.sdk ?? anthropicSdk;

  app.get('/', async (req, reply) => {
    const key = await getAiKey(opts.getSql(), req.userId!);
    if (!key) return reply.code(404).send({ error: 'not_found' });
    return key;
  });

  app.post('/', async (req, reply) => {
    const body = SaveAiKeyRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    if (!opts.secrets) return reply.code(503).send({ error: 'ai_unavailable' });
    const sql = opts.getSql();
    const { apiKey, bulkModel, qualityModel } = body.data;

    // A model change on the stored key is checked with that key.
    let checkWith = apiKey;
    if (!checkWith) {
      const [row] = await sql<{ sealed_key: string }[]>`select sealed_key from ai_keys where clerk_user_id = ${req.userId!}`;
      if (!row) return reply.code(404).send({ error: 'not_found' });
      checkWith = opts.secrets.open(row.sealed_key);
    }
    const check = await checkKey(sdk(checkWith), [bulkModel, qualityModel]);
    if (!check.ok) {
      return reply
        .code(400)
        .send(check.code === 'ai_model_unknown' ? { error: check.code, detail: check.model } : { error: check.code });
    }

    const saved = await saveAiKey(sql, opts.secrets, req.userId!, { apiKey, bulkModel, qualityModel });
    if (!saved) return reply.code(404).send({ error: 'not_found' });
    req.log.info({ userId: req.userId, bulkModel, qualityModel, newKey: Boolean(apiKey) }, 'ai key saved');
    return saved;
  });

  app.delete('/', async (req, reply) => {
    if (!(await deleteAiKey(opts.getSql(), req.userId!))) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
