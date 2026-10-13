import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DesktopAuthorizeResponse, DesktopTokenResponse, HealthResponse, MeResponse } from '@nvoke/shared';
import { loadEnv } from '../env.js';
import { s256Challenge } from '../auth/crypto.js';
import { memoryStore } from '../auth/store.js';
import type { Accounts } from '../leads/accounts.js';
import { buildApp } from './app.js';

const CLERK_JWT = 'header.payload.signature';
const USER_ID = 'user_test';

/** In memory accounts: records who got one, everyone is on the free plan. */
function memoryAccounts(): Accounts & { created: Set<string> } {
  const created = new Set<string>();
  return {
    created,
    ensure: async (userId) => void created.add(userId),
    summary: async (userId) => ({
      userId,
      plan: 'free',
      usage: { period: '2026-10', emailsFound: 3, emailsLimit: 50 },
      maxSearchLimit: 50,
    }),
  };
}

describe('api', () => {
  let app: FastifyInstance;
  const store = memoryStore();
  const accounts = memoryAccounts();

  beforeAll(async () => {
    app = await buildApp(loadEnv({ NODE_ENV: 'test', CLERK_SECRET_KEY: 'sk_test_placeholder' }), {
      store,
      // Stand-in for Clerk: one known session JWT.
      verifyClerk: async (token) => {
        if (token !== CLERK_JWT) throw new Error('bad jwt');
        return { userId: USER_ID, sessionId: 'sess_test' };
      },
      users: {
        getProfile: async () => ({ email: 'test@example.com', name: 'Test User', imageUrl: null }),
      },
      accounts,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json()).status).toBe('ok');
  });

  it('GET /v1/me without a token is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('allows the site origins through CORS by default', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/desktop/authorize',
      headers: {
        origin: 'https://nvoke.run',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://nvoke.run');
  });

  it('runs the whole desktop flow: authorize, token, me, sign-out', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const auth = { authorization: `Bearer ${CLERK_JWT}` };

    const authorize = await app.inject({
      method: 'POST',
      url: '/v1/desktop/authorize',
      headers: auth,
      payload: { state: randomBytes(16).toString('base64url'), code_challenge: s256Challenge(verifier) },
    });
    expect(authorize.statusCode).toBe(200);
    const { code } = DesktopAuthorizeResponse.parse(authorize.json());

    const token = await app.inject({
      method: 'POST',
      url: '/v1/desktop/token',
      payload: { code, code_verifier: verifier, device_name: 'test' },
    });
    expect(token.statusCode).toBe(200);
    const device = DesktopTokenResponse.parse(token.json()).token;

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${device}` } });
    expect(me.statusCode).toBe(200);
    expect(MeResponse.parse(me.json())).toEqual({
      user: { id: USER_ID, email: 'test@example.com', name: 'Test User', imageUrl: null },
      via: 'device',
      plan: 'free',
      usage: { period: '2026-10', emailsFound: 3, emailsLimit: 50 },
      maxSearchLimit: 50,
    });
    // The first authenticated request created the account.
    expect(accounts.created.has(USER_ID)).toBe(true);

    // A device token cannot mint new codes; only a browser session can.
    const nested = await app.inject({
      method: 'POST',
      url: '/v1/desktop/authorize',
      headers: { authorization: `Bearer ${device}` },
      payload: { state: randomBytes(16).toString('base64url'), code_challenge: s256Challenge(verifier) },
    });
    expect(nested.statusCode).toBe(401);

    const signOut = await app.inject({
      method: 'POST',
      url: '/v1/desktop/sign-out',
      headers: { authorization: `Bearer ${device}` },
    });
    expect(signOut.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${device}` } });
    expect(after.statusCode).toBe(401);
  });

  it('refuses a replayed code', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const authorize = await app.inject({
      method: 'POST',
      url: '/v1/desktop/authorize',
      headers: { authorization: `Bearer ${CLERK_JWT}` },
      payload: { state: randomBytes(16).toString('base64url'), code_challenge: s256Challenge(verifier) },
    });
    const { code } = DesktopAuthorizeResponse.parse(authorize.json());
    const first = await app.inject({ method: 'POST', url: '/v1/desktop/token', payload: { code, code_verifier: verifier } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/v1/desktop/token', payload: { code, code_verifier: verifier } });
    expect(second.statusCode).toBe(400);
    expect(second.json()).toEqual({ error: 'invalid_code' });
  });

  it('rejects authorize without a Clerk session or with a bad body', async () => {
    const noAuth = await app.inject({ method: 'POST', url: '/v1/desktop/authorize', payload: {} });
    expect(noAuth.statusCode).toBe(401);
    const badJwt = await app.inject({
      method: 'POST',
      url: '/v1/desktop/authorize',
      headers: { authorization: 'Bearer a.b.c' },
      payload: {},
    });
    expect(badJwt.statusCode).toBe(401);
    const badBody = await app.inject({
      method: 'POST',
      url: '/v1/desktop/authorize',
      headers: { authorization: `Bearer ${CLERK_JWT}` },
      payload: { state: 'x', code_challenge: 'y' },
    });
    expect(badBody.statusCode).toBe(400);
  });

  it('sign-out needs a device token, not a Clerk session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/desktop/sign-out',
      headers: { authorization: `Bearer ${CLERK_JWT}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
