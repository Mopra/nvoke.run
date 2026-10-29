// The shapes of catalog entries. Each group file under ./ fills them.

import type { z } from 'zod';

/** `key`: an API key, desktop token, Clerk session or OAuth token. `session`: a Clerk session from the site. */
export type EndpointAuth = 'public' | 'key' | 'session';

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Fastify style, `:id` for path parameters. */
  path: string;
  group: 'Account' | 'Searches' | 'Leads' | 'Drops' | 'Webhooks' | 'API keys' | 'Agents' | 'Privacy' | 'Tools' | 'Meta';
  summary: string;
  description: string;
  auth: EndpointAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Success status and body. `csv` for text/csv, null for an empty body. */
  status: number;
  response: z.ZodType | 'csv' | null;
  /** Error codes this endpoint may answer with, besides 401 and 5xx. */
  errors: string[];
  /** A request body or query to show in the docs. */
  example?: unknown;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** Object schema of the arguments. */
  input: z.ZodObject;
  readOnly: boolean;
  destructive: boolean;
}
