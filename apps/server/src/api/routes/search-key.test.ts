import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SearchKey } from '@nvoke/shared';
import { createSecrets } from '../../crypto/secrets.js';
import { ensureAccount } from '../../leads/quota.js';
import type { OwnSearchKey } from '../../leads/search-keys.js';
import type { SearchKeyCheck } from '../../leads/sources/own-search.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { searchKeyRoutes } from './search-key.js';

let db: TestDb;
let app: FastifyInstance;
let off: FastifyInstance;
const secrets = createSecrets(randomBytes(32).toString('base64'));

const GOOD = 'serper-good-key-000000000000abcd';
const OTHER = 'brave-other-key-00000000000wxyz';
const BAD = 'serper-bad-key-0000000000000zzzz';
const DOWN = 'serper-down-key-000000000000down';

/** Keys the fake check was asked about. BAD is refused, DOWN cannot be checked. No network. */
let checked: OwnSearchKey[] = [];
const check = async (key: OwnSearchKey): Promise<SearchKeyCheck> => {
  checked.push(key);
  if (key.apiKey === BAD) return { ok: false, code: 'search_key_rejected', detail: 'the key or credit was refused (401 Unauthorized)' };
  if (key.apiKey === DOWN) return { ok: false, code: 'source_unavailable' };
  return { ok: true };
};

const authenticate = async (req: FastifyRequest) => {
  const user = req.headers['x-test-user'];
  if (typeof user === 'string') req.userId = user;
};

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(searchKeyRoutes, { prefix: '/v1/search-key', getSql: () => db.sql, authenticate, secrets, check });
  await app.ready();
  off = Fastify();
  await off.register(searchKeyRoutes, { prefix: '/v1/search-key', getSql: () => db.sql, authenticate, secrets: null, check });
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
  checked = [];
});

const as = (user: string) => ({ 'x-test-user': user });
const get = (user = 'alice') => app.inject({ method: 'GET', url: '/v1/search-key', headers: as(user) });
const save = (payload: object, user = 'alice', on = app) => on.inject({ method: 'POST', url: '/v1/search-key', headers: as(user), payload });
const del = (user = 'alice') => app.inject({ method: 'DELETE', url: '/v1/search-key', headers: as(user) });

describe('/v1/search-key', () => {
  it('stores a checked key sealed and only ever shows its last 4', async () => {
    expect((await get()).statusCode).toBe(404);

    const res = await save({ provider: 'serper', apiKey: GOOD });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(GOOD);
    const key = SearchKey.parse(res.json());
    expect(key).toMatchObject({ provider: 'serper', last4: 'abcd' });
    expect(checked).toEqual([{ provider: 'serper', apiKey: GOOD }]);

    const [row] = await db.sql<{ sealed_key: string }[]>`select sealed_key from search_keys where clerk_user_id = 'alice'`;
    expect(row!.sealed_key).not.toContain(GOOD);
    expect(secrets.open(row!.sealed_key)).toBe(GOOD);

    const read = await get();
    expect(read.statusCode).toBe(200);
    expect(read.body).not.toContain(GOOD);
    expect(read.json()).toMatchObject({ provider: 'serper', last4: 'abcd' });
    expect((await get('bob')).statusCode).toBe(404);
  });

  it('replaces the stored key, provider and all', async () => {
    await save({ provider: 'serper', apiKey: GOOD });
    expect((await save({ provider: 'brave', apiKey: OTHER })).json()).toMatchObject({ provider: 'brave', last4: 'wxyz' });
    const [row] = await db.sql<{ provider: string; sealed_key: string }[]>`select provider, sealed_key from search_keys where clerk_user_id = 'alice'`;
    expect(row!.provider).toBe('brave');
    expect(secrets.open(row!.sealed_key)).toBe(OTHER);
  });

  it('keeps nothing when the provider refuses the key, and says why', async () => {
    const res = await save({ provider: 'serper', apiKey: BAD });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'search_key_rejected', detail: 'the key or credit was refused (401 Unauthorized)' });
    expect((await get()).statusCode).toBe(404);
  });

  it('keeps nothing when the key cannot be checked', async () => {
    const res = await save({ provider: 'serper', apiKey: DOWN });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'source_unavailable' });
    expect((await get()).statusCode).toBe(404);
  });

  it('refuses a malformed body before checking the key', async () => {
    expect((await save({ provider: 'serper', apiKey: 'short' })).statusCode).toBe(400);
    expect((await save({ provider: 'google', apiKey: GOOD })).statusCode).toBe(400);
    expect((await save({ apiKey: GOOD })).json()).toMatchObject({ error: 'invalid_request' });
    expect(checked).toEqual([]);
  });

  it('is unavailable without SECRETS_KEY', async () => {
    const res = await save({ provider: 'serper', apiKey: GOOD }, 'alice', off);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'source_unavailable' });
    expect(checked).toEqual([]);
  });

  it("deletes the key once, and only the caller's", async () => {
    await save({ provider: 'serper', apiKey: GOOD });
    await save({ provider: 'brave', apiKey: OTHER }, 'bob');
    expect((await del()).statusCode).toBe(204);
    expect((await get()).statusCode).toBe(404);
    expect((await del()).statusCode).toBe(404);
    expect((await get('bob')).json()).toMatchObject({ provider: 'brave', last4: 'wxyz' });
  });

  it('needs a signed in user', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search-key' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/v1/search-key', payload: { provider: 'serper', apiKey: GOOD } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/v1/search-key' })).statusCode).toBe(401);
    expect(checked).toEqual([]);
  });
});
