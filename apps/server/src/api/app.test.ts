import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HealthResponse } from '@nvoke/shared';
import { loadEnv } from '../env.js';
import { buildApp } from './app.js';

describe('api', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv({ NODE_ENV: 'test', CLERK_SECRET_KEY: 'sk_test_placeholder' }));
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
});
