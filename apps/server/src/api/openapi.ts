// GET /v1/openapi.json: OpenAPI 3.1, built from the endpoint catalog in
// packages/shared/src/catalog.ts and the zod schemas it points at.

import { z } from 'zod';
import { ENDPOINTS, ERROR_CODES, type Endpoint } from '@nvoke/shared';
import { VERSION } from '../version.js';

type Json = Record<string, unknown>;

function schema(s: z.ZodType, io: 'input' | 'output'): Json {
  const out = z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Json;
  delete out['$schema'];
  return out;
}

/** Turns an object schema into OpenAPI parameters. */
function parameters(s: z.ZodType | undefined, where: 'path' | 'query'): Json[] {
  if (!s) return [];
  const js = schema(s, 'input') as { properties?: Record<string, Json>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, prop]) => ({
    name,
    in: where,
    required: where === 'path' || (js.required ?? []).includes(name),
    description: typeof prop['description'] === 'string' ? prop['description'] : undefined,
    schema: prop,
  }));
}

function operation(e: Endpoint): Json {
  const responses: Json = {};
  responses[String(e.status)] =
    e.response === null
      ? { description: 'No content' }
      : e.response === 'csv'
        ? { description: 'CSV', content: { 'text/csv': { schema: { type: 'string' } } } }
        : { description: 'OK', content: { 'application/json': { schema: schema(e.response, 'output') } } };
  if (e.errors.length > 0 || e.auth !== 'public') {
    responses['4XX'] = {
      description: [...(e.auth === 'public' ? [] : ['unauthorized']), ...e.errors].map((c) => `\`${c}\`: ${ERROR_CODES[c] ?? ''}`).join('\n\n'),
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }
  return {
    operationId: e.id,
    summary: e.summary,
    description: e.description,
    tags: [e.group],
    security: e.auth === 'public' ? [] : [{ bearer: [] }],
    parameters: [...parameters(e.params, 'path'), ...parameters(e.query, 'query')],
    ...(e.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: schema(e.body, 'input'), ...(e.example ? { example: e.example } : {}) } },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApi(apiUrl: string): Json {
  const paths: Record<string, Json> = {};
  for (const e of ENDPOINTS) {
    const path = e.path.replace(/:(\w+)/g, '{$1}');
    paths[path] = { ...paths[path], [e.method.toLowerCase()]: operation(e) };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'nvoke API',
      version: VERSION,
      description:
        'Find companies, read their websites and get email addresses checked with the mail server. Everything the desktop app does. Send `Authorization: Bearer <API key>`.',
    },
    servers: [{ url: apiUrl }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'An API key (nvk_sk_...) or an OAuth access token from nvoke’s Clerk.' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'string', enum: Object.keys(ERROR_CODES) }, details: {} },
        },
      },
    },
    paths,
  };
}
