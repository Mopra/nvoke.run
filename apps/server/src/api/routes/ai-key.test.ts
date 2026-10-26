import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiKey } from '@nvoke/shared';
import type { AnthropicSdk } from '../../ai/anthropic.js';
import { createSecrets } from '../../crypto/secrets.js';
import { ensureAccount } from '../../leads/quota.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { aiKeyRoutes } from './ai-key.js';

let db: TestDb;
let app: FastifyInstance;
let off: FastifyInstance;
const secrets = createSecrets(randomBytes(32).toString('base64'));

const GOOD = 'sk-ant-api03-good-key-000000000abcd';
const OTHER = 'sk-ant-api03-other-key-00000000wxyz';
const BAD = 'sk-ant-api03-bad-key-0000000000zzzz';
const headers = new Headers();

/** Keys the fake SDK was built with, and the models it was asked about. */
let built: string[] = [];
let retrieved: string[] = [];

/** A fake Anthropic: BAD is refused, models outside the known list are 404. No network. */
const sdk = (apiKey: string): AnthropicSdk => {
  built.push(apiKey);
  return {
    messages: {
      async create() {
        throw new Error('the key check must not spend tokens');
      },
    },
    models: {
      async retrieve(id) {
        retrieved.push(id);
        if (apiKey === BAD) throw new Anthropic.AuthenticationError(401, { type: 'authentication_error' }, 'invalid x-api-key', headers);
        if (!['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].includes(id)) {
          throw new Anthropic.NotFoundError(404, { type: 'not_found_error' }, `model: ${id}`, headers);
        }
        return { id };
      },
    },
  };
};

const authenticate = async (req: FastifyRequest) => {
  const user = req.headers['x-test-user'];
  if (typeof user === 'string') req.userId = user;
};

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(aiKeyRoutes, { prefix: '/v1/ai-key', getSql: () => db.sql, authenticate, secrets, sdk });
  await app.ready();
  off = Fastify();
  await off.register(aiKeyRoutes, { prefix: '/v1/ai-key', getSql: () => db.sql, authenticate, secrets: null, sdk });
  await off.ready();
});

afterAll(async () => {
  await app.close();
  await off.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await ensureAccount(db.sql, 'alice');
  await ensureAccount(db.sql, 'bob');
  built = [];
  retrieved = [];
});

const as = (user: string) => ({ 'x-test-user': user });
const get = (user = 'alice') => app.inject({ method: 'GET', url: '/v1/ai-key', headers: as(user) });
const save = (payload: object, user = 'alice', on = app) => on.inject({ method: 'POST', url: '/v1/ai-key', headers: as(user), payload });
const del = (user = 'alice') => app.inject({ method: 'DELETE', url: '/v1/ai-key', headers: as(user) });

describe('/v1/ai-key', () => {
  it('stores a checked key sealed and only ever shows its last 4', async () => {
    expect((await get()).statusCode).toBe(404);

    const res = await save({ apiKey: GOOD });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(GOOD);
    const key = AiKey.parse(res.json());
    expect(key).toMatchObject({ provider: 'anthropic', last4: 'abcd', bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-sonnet-5-5' });
    expect(built).toEqual([GOOD]);
    expect(retrieved).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);

    const [row] = await db.sql<{ sealed_key: string }[]>`select sealed_key from ai_keys where clerk_user_id = 'alice'`;
    expect(row!.sealed_key).not.toContain(GOOD);
    expect(secrets.open(row!.sealed_key)).toBe(GOOD);

    const read = await get();
    expect(read.statusCode).toBe(200);
    expect(read.body).not.toContain(GOOD);
    expect(read.json()).toMatchObject({ last4: 'abcd' });
    expect((await get('bob')).statusCode).toBe(404);
  });

  it('changes only the models when no key is sent, checking them with the stored key', async () => {
    await save({ apiKey: GOOD });
    built = [];
    const res = await save({ bulkModel: 'claude-sonnet-5-5', qualityModel: 'claude-opus-5-5' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ last4: 'abcd', bulkModel: 'claude-sonnet-5-5', qualityModel: 'claude-opus-5-5' });
    expect(built).toEqual([GOOD]);
  });

  it('replaces the stored key with a new one', async () => {
    await save({ apiKey: GOOD });
    expect((await save({ apiKey: OTHER })).json()).toMatchObject({ last4: 'wxyz' });
    const [row] = await db.sql<{ sealed_key: string }[]>`select sealed_key from ai_keys where clerk_user_id = 'alice'`;
    expect(secrets.open(row!.sealed_key)).toBe(OTHER);
  });

  it('answers 404 for a model change without a stored key', async () => {
    expect((await save({ bulkModel: 'claude-sonnet-5-5' })).statusCode).toBe(404);
    expect(built).toEqual([]);
  });

  it('keeps nothing when Anthropic refuses the key', async () => {
    const res = await save({ apiKey: BAD });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'ai_key_rejected' });
    expect((await get()).statusCode).toBe(404);
  });

  it('names a model the key does not offer', async () => {
    const res = await save({ apiKey: GOOD, qualityModel: 'claude-nope-1' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'ai_model_unknown', detail: 'claude-nope-1' });
    expect((await get()).statusCode).toBe(404);
  });

  it('refuses a malformed body before calling Anthropic', async () => {
    expect((await save({ apiKey: 'short' })).statusCode).toBe(400);
    expect((await save({ apiKey: GOOD, bulkModel: 'gpt-5' })).statusCode).toBe(400);
    expect(built).toEqual([]);
  });

  it('is unavailable without SECRETS_KEY', async () => {
    const res = await save({ apiKey: GOOD }, 'alice', off);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'ai_unavailable' });
  });

  it('deletes the key once', async () => {
    await save({ apiKey: GOOD });
    expect((await del()).statusCode).toBe(204);
    expect((await get()).statusCode).toBe(404);
    expect((await del()).statusCode).toBe(404);
  });

  it('needs a signed in user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/ai-key' });
    expect(res.statusCode).toBe(401);
  });
});
