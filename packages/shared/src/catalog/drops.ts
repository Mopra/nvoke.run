// The Drops group of the catalog: its endpoints, the MCP tools that call them and its error codes.

import { z } from 'zod';
import { CreateDropRequest, Drop, DropIdParams, DropListResponse, UpdateDropRequest } from '../drops.ts';
import type { Endpoint, McpTool } from './types.ts';

const dropId = z.uuid().describe('The drop id from list_drops.');
const dropSources = z.array(z.enum(['show_hn', 'launch_hn', 'product_hunt', 'yc'])).min(1);

export const dropEndpoints: Endpoint[] = [
  {
    id: 'listDrops',
    method: 'GET',
    path: '/v1/drops',
    group: 'Drops',
    summary: 'List daily drops',
    description:
      'Your daily drops, and how each launch source is doing (`sources`). A drop looks at new launches on Show HN, Launch HN, Product Hunt and YC once a day and delivers each run as a search of kind `drop`; list those with `GET /v1/searches`.',
    auth: 'key',
    status: 200,
    response: DropListResponse,
    errors: [],
  },
  {
    id: 'getDrop',
    method: 'GET',
    path: '/v1/drops/:id',
    group: 'Drops',
    summary: 'Get a drop',
    description: 'One drop with its next run and what it delivered so far.',
    auth: 'key',
    params: DropIdParams,
    status: 200,
    response: Drop,
    errors: ['not_found'],
  },
  {
    id: 'createDrop',
    method: 'POST',
    path: '/v1/drops',
    group: 'Drops',
    summary: 'Create a drop',
    description:
      'Every word of `keyword` must appear in a launch’s name, tagline, description or tags; left out, every launch matches. `sources` defaults to all of them. `dailyLimit` caps the companies one run delivers (default 25), held to what your plan allows. The first run looks back 7 days. At most 20 drops.',
    auth: 'key',
    body: CreateDropRequest,
    status: 201,
    response: Drop,
    errors: ['invalid_request', 'too_many_drops'],
    example: { name: 'Dev tools', keyword: 'developer', sources: ['show_hn', 'product_hunt'], dailyLimit: 25 },
  },
  {
    id: 'updateDrop',
    method: 'PATCH',
    path: '/v1/drops/:id',
    group: 'Drops',
    summary: 'Change a drop',
    description: 'Change the name, keyword, sources or daily limit, or pause and resume it with `enabled`. `keyword: null` removes the keyword.',
    auth: 'key',
    params: DropIdParams,
    body: UpdateDropRequest,
    status: 200,
    response: Drop,
    errors: ['not_found', 'invalid_request'],
    example: { enabled: false },
  },
  {
    id: 'runDrop',
    method: 'POST',
    path: '/v1/drops/:id/run',
    group: 'Drops',
    summary: 'Run a drop now',
    description: 'Moves the next run to now. The worker picks it up within a minute; a run that finds nothing new creates no search.',
    auth: 'key',
    params: DropIdParams,
    status: 200,
    response: Drop,
    errors: ['not_found'],
  },
  {
    id: 'deleteDrop',
    method: 'DELETE',
    path: '/v1/drops/:id',
    group: 'Drops',
    summary: 'Delete a drop',
    description: 'Stops the drop. The searches its runs made stay until you delete them.',
    auth: 'key',
    params: DropIdParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
];

export const dropTools: McpTool[] = [
  {
    name: 'list_drops',
    title: 'List daily drops',
    description: 'Your daily drops: each looks at new launches (Show HN, Launch HN, Product Hunt, YC) once a day and delivers them as a search of kind drop.',
    input: z.object({}),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'create_drop',
    title: 'Create a daily drop',
    description: 'Starts a daily drop of new launches. Every word of keyword must match; left out, every launch matches. The first run looks back 7 days.',
    input: z.object({
      name: z.string().describe('What to call it, e.g. "Dev tools".'),
      keyword: z.string().optional(),
      sources: dropSources.optional().describe('All when left out.'),
      dailyLimit: z.number().int().min(1).max(5000).optional().describe('Most companies a run delivers, default 25.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'update_drop',
    title: 'Change a daily drop',
    description: 'Changes name, keyword, sources or daily limit, or pauses and resumes it with enabled. keyword null removes the keyword.',
    input: z.object({
      dropId,
      name: z.string().optional(),
      keyword: z.string().nullable().optional(),
      sources: dropSources.optional(),
      dailyLimit: z.number().int().min(1).max(5000).optional(),
      enabled: z.boolean().optional(),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'run_drop',
    title: 'Run a drop now',
    description: 'Moves the drop\u2019s next run to now. A run that finds nothing new creates no search.',
    input: z.object({ dropId }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'delete_drop',
    title: 'Delete a daily drop',
    description: 'Stops the drop. The searches its runs made stay.',
    input: z.object({ dropId }),
    readOnly: false,
    destructive: true,
  },
];

export const dropErrors: Record<string, string> = {
  too_many_drops: 'The account holds 20 drops. Delete one first.',
};
