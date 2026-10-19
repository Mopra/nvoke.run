import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Drop, DropListResponse } from '@nvoke/shared';
import { storeItems } from '../../feed/collect.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { dropsRoutes } from './drops.js';

let db: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(dropsRoutes, {
    prefix: '/v1',
    getSql: () => db.sql,
    authenticate: async (req) => {
      const user = req.headers['x-test-user'];
      if (typeof user === 'string') req.userId = user;
    },
    sourcesAvailable: { show_hn: true, launch_hn: true, product_hunt: false, yc: true },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts, feed_items, feed_sources cascade`;
});

const as = (user: string) => ({ 'x-test-user': user });

async function create(user: string, payload: object) {
  return app.inject({ method: 'POST', url: '/v1/drops', headers: as(user), payload });
}

describe('drop routes', () => {
  it('401s without a user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/drops' });
    expect(res.statusCode).toBe(401);
  });

  it('creates a drop with defaults and lists it with the sources', async () => {
    await storeItems(db.sql, [{ source: 'show_hn', sourceRef: '1', name: 'A', website: 'https://a.io' }]);
    const res = await create('alice', { name: '  AI tools ', keyword: 'ai' });
    expect(res.statusCode).toBe(201);
    const drop = Drop.parse(res.json());
    expect(drop).toMatchObject({
      name: 'AI tools',
      keyword: 'ai',
      sources: ['show_hn', 'launch_hn', 'product_hunt', 'yc'],
      dailyLimit: 25,
      enabled: true,
      lastDeliveredAt: null,
      companiesDelivered: 0,
    });

    const list = DropListResponse.parse((await app.inject({ method: 'GET', url: '/v1/drops', headers: as('alice') })).json());
    expect(list.drops.map((d) => d.id)).toEqual([drop.id]);
    expect(list.sources.find((s) => s.source === 'show_hn')).toMatchObject({ available: true, lastWeek: 1 });
    expect(list.sources.find((s) => s.source === 'product_hunt')).toMatchObject({ available: false, lastWeek: 0 });

    // Another user sees none of it.
    const bob = DropListResponse.parse((await app.inject({ method: 'GET', url: '/v1/drops', headers: as('bob') })).json());
    expect(bob.drops).toEqual([]);
  });

  it('rejects bad input', async () => {
    expect((await create('alice', { name: '' })).statusCode).toBe(400);
    expect((await create('alice', { name: 'x', sources: ['reddit'] })).statusCode).toBe(400);
    expect((await create('alice', { name: 'x', dailyLimit: 5001 })).statusCode).toBe(400);
  });

  it('holds the daily limit to the plan', async () => {
    expect(Drop.parse((await create('alice', { name: 'Big', dailyLimit: 5000 })).json()).dailyLimit).toBe(200);
    await db.sql`update accounts set plan = 'emails_100000' where clerk_user_id = 'alice'`;
    expect(Drop.parse((await create('alice', { name: 'Bigger', dailyLimit: 5000 })).json()).dailyLimit).toBe(5000);
  });

  it('updates, pauses, runs and deletes, scoped to the owner', async () => {
    const drop = Drop.parse((await create('alice', { name: 'Fintech', keyword: 'bank' })).json());
    const url = `/v1/drops/${drop.id}`;

    expect((await app.inject({ method: 'PATCH', url, headers: as('bob'), payload: { enabled: false } })).statusCode).toBe(404);
    const paused = await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: { enabled: false, keyword: null, dailyLimit: 10 } });
    expect(Drop.parse(paused.json())).toMatchObject({ enabled: false, keyword: null, dailyLimit: 10 });
    expect((await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: {} })).statusCode).toBe(400);

    const ran = await app.inject({ method: 'POST', url: `${url}/run`, headers: as('alice') });
    expect(Drop.parse(ran.json()).enabled).toBe(true);
    expect(Date.parse(Drop.parse(ran.json()).nextRunAt)).toBeLessThanOrEqual(Date.now());

    expect((await app.inject({ method: 'DELETE', url, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: as('alice') })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url, headers: as('alice') })).statusCode).toBe(404);
  });

  it('caps drops per user', async () => {
    for (let i = 0; i < 20; i++) expect((await create('alice', { name: `d${i}` })).statusCode).toBe(201);
    const res = await create('alice', { name: 'one too many' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'too_many_drops' });
  });
});
