// The API keys group of the catalog: its endpoints and its error codes.

import { ApiKey, ApiKeyIdParams, ApiKeyListResponse, CreateApiKeyRequest, CreateApiKeyResponse, UpdateApiKeyRequest } from '../agents.ts';
import type { Endpoint } from './types.ts';

export const apiKeyEndpoints: Endpoint[] = [
  {
    id: 'listApiKeys',
    method: 'GET',
    path: '/v1/api-keys',
    group: 'API keys',
    summary: 'List API keys',
    description: 'Your live API keys. Only the prefix of each key is shown.',
    auth: 'key',
    status: 200,
    response: ApiKeyListResponse,
    errors: [],
  },
  {
    id: 'createApiKey',
    method: 'POST',
    path: '/v1/api-keys',
    group: 'API keys',
    summary: 'Create an API key',
    description: 'Makes a new key. The response holds the full key, and it is never shown again. At most 20 live keys.',
    auth: 'key',
    body: CreateApiKeyRequest,
    status: 201,
    response: CreateApiKeyResponse,
    errors: ['invalid_request', 'api_key_limit'],
    example: { name: 'CRM sync' },
  },
  {
    id: 'getApiKey',
    method: 'GET',
    path: '/v1/api-keys/:id',
    group: 'API keys',
    summary: 'Get an API key',
    description: 'One live key. Only its prefix is shown.',
    auth: 'key',
    params: ApiKeyIdParams,
    status: 200,
    response: ApiKey,
    errors: ['not_found'],
  },
  {
    id: 'renameApiKey',
    method: 'PATCH',
    path: '/v1/api-keys/:id',
    group: 'API keys',
    summary: 'Rename an API key',
    description: 'Changes the name. The key itself stays the same and keeps working.',
    auth: 'key',
    params: ApiKeyIdParams,
    body: UpdateApiKeyRequest,
    status: 200,
    response: ApiKey,
    errors: ['not_found', 'invalid_request'],
    example: { name: 'CRM sync (prod)' },
  },
  {
    id: 'revokeApiKey',
    method: 'DELETE',
    path: '/v1/api-keys/:id',
    group: 'API keys',
    summary: 'Revoke an API key',
    description: 'The key stops working at once. A key may revoke itself.',
    auth: 'key',
    params: ApiKeyIdParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
];

export const apiKeyErrors: Record<string, string> = {
  api_key_limit: 'The account holds 20 live keys. Revoke one first.',
};
