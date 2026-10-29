// The Meta group of the catalog: its endpoints.

import { z } from 'zod';
import { HealthResponse } from '../api.ts';
import type { Endpoint } from './types.ts';

export const metaEndpoints: Endpoint[] = [
  {
    id: 'openapi',
    method: 'GET',
    path: '/v1/openapi.json',
    group: 'Meta',
    summary: 'This API as OpenAPI 3.1',
    description: 'Machine readable description of every endpoint above.',
    auth: 'public',
    status: 200,
    response: z.object({ openapi: z.string() }).loose(),
    errors: [],
  },
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    group: 'Meta',
    summary: 'Health check',
    description: 'Answers 200 when the API is up.',
    auth: 'public',
    status: 200,
    response: HealthResponse,
    errors: [],
  },
];
