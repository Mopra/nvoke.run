// Turns the endpoint catalog in @nvoke/shared into what the docs show: field
// tables from the zod schemas and curl examples. The catalog is the single
// source, so the docs, the OpenAPI document and the MCP server never drift.

import { z } from 'zod';
import { ENDPOINTS, type Endpoint } from '@nvoke/shared';
import { apiUrl } from '@/lib/api';
import { site } from '@/lib/site';

export const urls = {
  api: apiUrl,
  apiBase: `${apiUrl}/v1`,
  mcp: `${apiUrl}/mcp`,
  openapi: `${apiUrl}/v1/openapi.json`,
  agentsMd: `${site.url}/agents.md`,
  llms: `${site.url}/llms.txt`,
  docs: `${site.url}/docs`,
};

type Json = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: Json;
  properties?: Record<string, Json>;
  required?: string[];
  anyOf?: Json[];
  oneOf?: Json[];
};

export interface Field {
  /** Dotted path, `params.niche`. */
  name: string;
  type: string;
  required: boolean;
  notes: string;
}

/** A schema as fields. A union gives one list per variant, labeled by its constant `kind`. */
export interface FieldGroup {
  label: string | null;
  fields: Field[];
}

function jsonSchema(s: z.ZodType, io: 'input' | 'output'): Json {
  return z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Json;
}

function typeOf(s: Json): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  const variants = s.anyOf ?? s.oneOf;
  if (variants) return [...new Set(variants.map(typeOf))].join(' | ');
  if (Array.isArray(s.type)) return s.type.join(' | ');
  if (s.type === 'array') {
    const item = s.items ? typeOf(s.items) : 'any';
    return item.includes(' | ') ? `(${item})[]` : `${item}[]`;
  }
  if (s.format === 'date-time') return 'datetime';
  if (s.format === 'uuid') return 'uuid';
  if (s.format === 'email') return 'email';
  return s.type ?? 'any';
}

function notesOf(s: Json): string {
  const parts: string[] = [];
  if (s.description) parts.push(s.description);
  if (s.minimum !== undefined && s.maximum !== undefined && s.maximum < 1e9) parts.push(`${s.minimum} to ${s.maximum}`);
  else if (s.maximum !== undefined && s.maximum < 1e9) parts.push(`at most ${s.maximum}`);
  if (s.maxLength !== undefined) parts.push(`up to ${s.maxLength} characters`);
  if (s.default !== undefined) parts.push(`default ${JSON.stringify(s.default)}`);
  return parts.join('. ');
}

function walk(s: Json, prefix: string, required: boolean, out: Field[], depth: number): void {
  const isObject = s.type === 'object' && s.properties;
  if (isObject && depth < 2) {
    if (prefix) out.push({ name: prefix, type: 'object', required, notes: notesOf(s) });
    for (const [key, child] of Object.entries(s.properties!)) {
      walk(child, prefix ? `${prefix}.${key}` : key, (s.required ?? []).includes(key), out, depth + 1);
    }
    return;
  }
  out.push({ name: prefix, type: isObject ? 'object' : typeOf(s), required, notes: notesOf(s) });
}

export function fieldGroups(schema: z.ZodType, io: 'input' | 'output'): FieldGroup[] {
  const js = jsonSchema(schema, io);
  const variants = js.oneOf ?? js.anyOf;
  if (variants && variants.every((v) => v.type === 'object')) {
    return variants.map((v) => {
      const kind = v.properties?.['kind']?.const;
      const fields: Field[] = [];
      walk(v, '', true, fields, 0);
      return { label: kind === undefined ? null : `kind: ${JSON.stringify(kind)}`, fields };
    });
  }
  const fields: Field[] = [];
  walk(js, '', true, fields, 0);
  return [{ label: null, fields }];
}

/** URL path with example values for the parameters. */
function examplePath(e: Endpoint): string {
  const id =
    e.group === 'API keys' ? '$KEY_ID' : e.group === 'Webhooks' ? '$WEBHOOK_ID' : e.group === 'Drops' ? '$DROP_ID' : '$SEARCH_ID';
  return e.path.replace(':id', id).replace(':companyId', '$COMPANY_ID').replace(':emailId', '$EMAIL_ID');
}

export function curlFor(e: Endpoint): string {
  const base = urls.api;
  const auth = e.auth === 'key' ? ` \\\n  -H "Authorization: Bearer $NVOKE_API_KEY"` : '';
  if (e.method === 'GET' || e.method === 'DELETE') {
    const query =
      e.example && typeof e.example === 'object'
        ? `?${new URLSearchParams(Object.entries(e.example as Record<string, unknown>).map(([k, v]) => [k, String(v)])).toString()}`
        : '';
    const method = e.method === 'DELETE' ? '-X DELETE ' : '';
    return `curl ${method}"${base}${examplePath(e)}${query}"${auth}`;
  }
  const body = e.example === undefined ? '' : ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(e.example)}'`;
  return `curl -X ${e.method} "${base}${examplePath(e)}"${auth}${body}`;
}

/** Endpoints grouped in catalog order. The claim route belongs to the site, so it is left out. */
export function endpointGroups(): Array<{ group: Endpoint['group']; endpoints: Endpoint[] }> {
  const groups: Array<{ group: Endpoint['group']; endpoints: Endpoint[] }> = [];
  for (const e of ENDPOINTS) {
    if (e.auth === 'session') continue;
    const g = groups.find((x) => x.group === e.group);
    if (g) g.endpoints.push(e);
    else groups.push({ group: e.group, endpoints: [e] });
  }
  return groups;
}

export function anchorOf(e: Endpoint): string {
  return e.id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export const AUTH_LABEL: Record<Endpoint['auth'], string> = {
  key: 'API key',
  public: 'Public',
  session: 'Site session',
};
