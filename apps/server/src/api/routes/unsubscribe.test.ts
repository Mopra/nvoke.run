import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecrets } from '../../crypto/secrets.js';
import { ensureAccount } from '../../leads/quota.js';
import { signUnsubscribe } from '../../sending/unsubscribe.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { unsubscribeRoutes } from './unsubscribe.js';

let db: TestDb;
let app: FastifyInstance;
let off: FastifyInstance;
const secrets = createSecrets(randomBytes(32).toString('base64'));

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(unsubscribeRoutes, { getSql: () => db.sql, secrets });
  await app.ready();
  off = Fastify();
  await off.register(unsubscribeRoutes, { getSql: () => db.sql, secrets: null });
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
});

async function sent() {
  const [m] = await db.sql<{ id: string }[]>`
    insert into messages (clerk_user_id, direction, kind, subject, from_address, to_address, step)
    values ('alice', 'out', 'step', 'Leads', 'ada@acme.io', 'jo@client.io', 1)
    returning id`;
  return m!.id;
}

const suppressions = () => db.sql`select reason from send_suppressions where clerk_user_id = 'alice'`;

describe('unsubscribe routes', () => {
  it('shows a confirm page on GET and changes nothing', async () => {
    const token = signUnsubscribe(secrets, await sent());
    const res = await app.inject({ method: 'GET', url: `/u/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<form method="post">');
    expect(await suppressions()).toHaveLength(0);
  });

  it('unsubscribes on a one-click POST and on the button', async () => {
    const token = signUnsubscribe(secrets, await sent());
    const res = await app.inject({
      method: 'POST',
      url: `/u/${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('You will not hear from this sender again.');
    expect(await suppressions()).toEqual([{ reason: 'unsubscribe' }]);

    // A second click, now without a body, is still fine.
    expect((await app.inject({ method: 'POST', url: `/u/${token}` })).statusCode).toBe(200);
    expect(await suppressions()).toHaveLength(1);
  });

  it('answers 404 for a tampered or unknown token, and without SECRETS_KEY', async () => {
    const token = signUnsubscribe(secrets, await sent());
    const tampered = `${token.slice(0, -2)}xx`;
    expect((await app.inject({ method: 'GET', url: `/u/${tampered}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/u/${tampered}` })).statusCode).toBe(404);
    const unknown = signUnsubscribe(secrets, '00000000-0000-4000-8000-000000000000');
    expect((await app.inject({ method: 'POST', url: `/u/${unknown}` })).statusCode).toBe(404);
    expect((await off.inject({ method: 'POST', url: `/u/${token}` })).statusCode).toBe(404);
    expect(await suppressions()).toHaveLength(0);
  });
});
