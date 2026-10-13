import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { loadEnv } from '../../env.js';
import { memoryStore } from '../../auth/store.js';
import { addressHash, domainHash } from '../../leads/suppression.js';
import { buildApp } from '../app.js';
import { privacyRoutes } from './privacy.js';

let db: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  db = await createTestDb();
  // Same trustProxy as app.ts: X-Forwarded-For counts only from a private peer (Traefik).
  app = Fastify({ trustProxy: ['loopback', 'uniquelocal'] });
  await app.register(privacyRoutes, { prefix: '/v1/privacy', getSql: () => db.sql, rateLimit: { max: 3, windowMs: 60_000 } });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts, suppressions, domains, email_checks cascade`;
});

let ipCounter = 0;
/** Each test gets its own client IP, so the rate limit only bites where a test wants it to. */
const freshIp = () => `203.0.113.${++ipCounter}`;

const optOut = (payload: unknown, ip = freshIp()) =>
  app.inject({ method: 'POST', url: '/v1/privacy/opt-out', payload: payload as object, headers: { 'x-forwarded-for': `10.9.9.9, ${ip}` } });

async function seedEmail(address: string, domain: string) {
  await db.sql`insert into accounts (clerk_user_id) values ('alice') on conflict do nothing`;
  const [s] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit", emails_found, companies_found) values ('alice', 'local', 10, 1, 1) returning id`;
  const [c] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source)
    values (${s!.id}, 'alice', 'Acme', ${domain}, ${`https://${domain}/`}, 'test') returning id`;
  await db.sql`
    insert into emails (company_id, search_id, clerk_user_id, address, kind) values (${c!.id}, ${s!.id}, 'alice', ${address}, 'personal')`;
}

describe('POST /v1/privacy/opt-out', () => {
  it('erases and suppresses an address', async () => {
    await seedEmail('jane@acme.dk', 'acme.dk');
    const res = await optOut({ email: 'Jane@Acme.dk' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await db.sql`select 1 from emails`).toHaveLength(0);
    expect(await db.sql`select kind, source from suppressions where hash = ${addressHash('jane@acme.dk')}`).toEqual([
      { kind: 'address', source: 'opt_out_page' },
    ]);
  });

  it('erases and suppresses a domain', async () => {
    await seedEmail('jane@acme.dk', 'acme.dk');
    const res = await optOut({ domain: 'www.acme.dk' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await db.sql`select 1 from companies`).toHaveLength(0);
    expect(await db.sql`select kind from suppressions where hash = ${domainHash('acme.dk')}`).toEqual([{ kind: 'domain' }]);
  });

  it('answers the same whether or not anything was held', async () => {
    await seedEmail('jane@acme.dk', 'acme.dk');
    const held = await optOut({ email: 'jane@acme.dk' });
    const unknown = await optOut({ email: 'nobody@nowhere.dk' });
    expect(unknown.statusCode).toBe(held.statusCode);
    expect(unknown.body).toBe(held.body);
  });

  it('ignores shared mail providers as domains', async () => {
    for (const domain of ['gmail.com', 'hotmail.co.uk', 'post.tele.dk']) {
      const res = await optOut({ domain });
      expect(res.json()).toEqual({ ok: true });
    }
    expect(await db.sql`select 1 from suppressions`).toHaveLength(0);
  });

  it('400s on an invalid body', async () => {
    for (const payload of [{}, { email: 'not-an-email' }, { domain: 'x' }, { domain: 'not a domain' }, { email: 42 }]) {
      const res = await optOut(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_request' });
    }
  });

  it('429s past the per-IP limit, counting each client separately', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) expect((await optOut({ email: `a${i}@acme.dk` }, ip)).statusCode).toBe(200);
    const limited = await optOut({ email: 'a9@acme.dk' }, ip);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'rate_limited' });
    expect((await optOut({ email: 'a9@acme.dk' })).statusCode).toBe(200);
  });

  it('ignores X-Forwarded-For from a public peer', async () => {
    const remoteAddress = '198.51.100.7';
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/v1/privacy/opt-out',
        payload: { email: 'b@acme.dk' },
        remoteAddress,
        headers: { 'x-forwarded-for': freshIp() },
      });
    for (let i = 0; i < 3; i++) expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
  });
});

describe('opt-out in the full app', () => {
  let real: FastifyInstance;

  beforeAll(async () => {
    real = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
      getSql: () => db.sql,
      store: memoryStore(),
      verifyClerk: null,
      users: null,
    });
  });

  afterAll(async () => {
    await real.close();
  });

  it('needs no sign-in and allows the site origin through CORS', async () => {
    const preflight = await real.inject({
      method: 'OPTIONS',
      url: '/v1/privacy/opt-out',
      headers: { origin: 'https://nvoke.run', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://nvoke.run');

    const res = await real.inject({
      method: 'POST',
      url: '/v1/privacy/opt-out',
      headers: { origin: 'https://nvoke.run' },
      payload: { email: 'jane@acme.dk' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://nvoke.run');
    expect(res.json()).toEqual({ ok: true });
  });
});
