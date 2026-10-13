// The MCP server (docs/SPEC.md, "API and agents"): POST /mcp, Streamable
// HTTP, stateless, JSON responses. Tools are listed in
// packages/shared/src/catalog.ts and each one runs the matching REST route
// in process with the caller's own credential, so MCP and the API cannot
// disagree on auth, quotas or shapes.
//
// Auth: an API key (nvk_sk_...) as a bearer header, or a Clerk OAuth token.
// MCP clients that do OAuth find Clerk through the protected resource
// metadata below (RFC 9728), register themselves (client ID metadata
// documents or dynamic registration, switched on in the Clerk dashboard) and
// send the person through Clerk's sign-in, where they can also sign up.

import type { FastifyInstance, FastifyReply, InjectOptions } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MCP_INSTRUCTIONS, MCP_TOOLS } from '@nvoke/shared';
import { VERSION } from '../../version.js';

export interface McpRoutesOptions {
  apiUrl: string;
  siteUrl: string;
  /** Clerk's Frontend API origin, the OAuth authorization server. Null switches OAuth off. */
  clerkIssuer: string | null;
  fetch?: typeof fetch;
}

/** The Clerk Frontend API origin encoded in a publishable key (pk_live_<base64("host$")>). */
export function clerkIssuerFromPublishableKey(key: string | undefined): string | null {
  const match = key?.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const host = Buffer.from(match[1]!, 'base64').toString('utf8').replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

const TERMINAL = new Set(['done', 'failed', 'canceled']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Args = Record<string, unknown>;
type Call = { method: 'GET' | 'POST' | 'DELETE'; url: string; body?: unknown };

/** Query string from the defined values. */
function qs(values: Args): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Maps a tool call to the REST route it stands for. */
export function toolRequest(name: string, a: Args): Call {
  const id = encodeURIComponent(String(a['searchId'] ?? ''));
  switch (name) {
    case 'get_account':
      return { method: 'GET', url: '/v1/me' };
    case 'list_searches':
      return { method: 'GET', url: '/v1/searches' };
    case 'get_search':
    case 'wait_for_search':
      return { method: 'GET', url: `/v1/searches/${id}` };
    case 'cancel_search':
      return { method: 'POST', url: `/v1/searches/${id}/cancel` };
    case 'delete_search':
      return { method: 'DELETE', url: `/v1/searches/${id}` };
    case 'get_leads':
      return {
        method: 'GET',
        url: `/v1/searches/${id}/companies${qs({ verification: a['verification'], kind: a['kind'], q: a['q'], cursor: a['cursor'], limit: a['limit'] })}`,
      };
    case 'export_csv':
      return { method: 'GET', url: `/v1/searches/${id}/export.csv${qs({ verification: a['verification'], kind: a['kind'], q: a['q'] })}` };
    case 'start_search': {
      const kind = a['kind'];
      const params =
        kind === 'local'
          ? { niche: a['niche'], location: a['location'] }
          : kind === 'web'
            ? { keyword: a['keyword'], country: a['country'] }
            : kind === 'domains'
              ? { items: a['items'], country: a['country'] }
              : { keyword: a['keyword'], days: a['days'] };
      return { method: 'POST', url: '/v1/searches', body: { kind, params, limit: a['limit'] } };
    }
    case 'list_webhooks':
      return { method: 'GET', url: '/v1/webhooks' };
    case 'create_webhook':
      return { method: 'POST', url: '/v1/webhooks', body: { url: a['url'], events: a['events'], scope: a['scope'], dropId: a['dropId'] } };
    case 'test_webhook':
      return { method: 'POST', url: `/v1/webhooks/${encodeURIComponent(String(a['webhookId'] ?? ''))}/test` };
    case 'delete_webhook':
      return { method: 'DELETE', url: `/v1/webhooks/${encodeURIComponent(String(a['webhookId'] ?? ''))}` };
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

export async function mcpRoutes(app: FastifyInstance, opts: McpRoutesOptions): Promise<void> {
  const resource = new URL('/mcp', opts.apiUrl).toString();
  const resourceMetadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', opts.apiUrl).toString();
  const doFetch = opts.fetch ?? fetch;

  // Tells an MCP client where to get a token when it has none (RFC 9728).
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/mcp') && reply.statusCode === 401 && opts.clerkIssuer) {
      reply.header('www-authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
    }
    return payload;
  });

  const protectedResource = async (_req: unknown, reply: FastifyReply) => {
    if (!opts.clerkIssuer) return reply.code(404).send({ error: 'not_found' });
    return {
      resource,
      authorization_servers: [opts.clerkIssuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email'],
      resource_name: 'nvoke',
      resource_documentation: new URL('/docs/mcp', opts.siteUrl).toString(),
    };
  };
  app.get('/.well-known/oauth-protected-resource', protectedResource);
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

  // Older MCP clients look for the authorization server on the resource's
  // own origin. Mirror Clerk's document for them.
  let mirrored: { at: number; body: unknown } | null = null;
  app.get('/.well-known/oauth-authorization-server', async (req, reply) => {
    if (!opts.clerkIssuer) return reply.code(404).send({ error: 'not_found' });
    if (!mirrored || Date.now() - mirrored.at > 60 * 60_000) {
      try {
        const res = await doFetch(`${opts.clerkIssuer}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) throw new Error(`clerk answered ${res.status}`);
        mirrored = { at: Date.now(), body: await res.json() };
      } catch (err) {
        req.log.warn({ err }, 'could not read clerk oauth metadata');
        return reply.code(502).send({ error: 'upstream_unavailable' });
      }
    }
    return mirrored.body;
  });

  app.post('/mcp', { preHandler: app.requireAuth }, async (req, reply) => {
    const authorization = req.headers.authorization!;

    /** Runs a REST route as the caller. */
    const call = async ({ method, url, body }: Call) => {
      const options: InjectOptions = { method, url, headers: { authorization } };
      if (body !== undefined) options.payload = body as InjectOptions['payload'];
      return app.inject(options);
    };

    const server = new McpServer({ name: 'nvoke', version: VERSION }, { instructions: MCP_INSTRUCTIONS });
    for (const tool of MCP_TOOLS) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.destructive, openWorldHint: false },
        },
        async (args: Args) => {
          const request = toolRequest(tool.name, args);
          let res = await call(request);
          if (tool.name === 'wait_for_search' && res.statusCode === 200) {
            const deadline = Date.now() + Math.min(Number(args['timeoutSeconds'] ?? 45), 50) * 1000;
            while (!TERMINAL.has((res.json() as { status: string }).status) && Date.now() < deadline) {
              await sleep(2_000);
              res = await call(request);
              if (res.statusCode !== 200) break;
            }
          }
          const text = res.statusCode === 204 ? JSON.stringify({ ok: true }) : res.body;
          return { content: [{ type: 'text' as const, text }], isError: res.statusCode >= 400 };
        },
      );
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Stateless: no server-sent event stream and no sessions to end.
  const notAllowed = async (_req: unknown, reply: FastifyReply) =>
    reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
