import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentSignupResponse,
  ApiKeyListResponse,
  ClaimResponse,
  CreateApiKeyResponse,
  ENDPOINTS,
  MCP_TOOLS,
  MeResponse,
  Search,
} from '@nvoke/shared';
import { loadEnv } from '../env.js';
import { memoryStore } from '../auth/store.js';
import { postgresAccounts } from '../leads/accounts.js';
import { purgeAgentSignups } from '../agents/purge.js';
import type { AgentDirectory, ClaimMailer } from '../agents/signup.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { buildApp } from './app.js';
import { clerkIssuerFromPublishableKey, toolRequest } from './routes/mcp.js';

const OWNER_JWT = 'owner.session.jwt';

let db: TestDb;
let app: FastifyInstance;
const users = new Map<string, string>();
const mails: Array<{ to: string; text: string }> = [];
let nextIp = 1;

const directory: AgentDirectory = {
  emailTaken: async (email) => users.has(email),
  createUser: async (email) => {
    const userId = `user_agent_${users.size + 1}`;
    users.set(email, userId);
    return { userId };
  },
  deleteUser: async () => undefined,
  claimTicket: async (userId) => `ticket_for_${userId}`,
};
const mailer: ClaimMailer = {
  send: async (mail) => {
    mails.push(mail);
    return true;
  },
};

beforeAll(async () => {
  db = await createTestDb();
  app = await buildApp(
    loadEnv({ NODE_ENV: 'test', SITE_URL: 'https://nvoke.test', PUBLIC_API_URL: 'https://api.nvoke.test', CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('clerk.nvoke.test$').toString('base64')}` }),
    {
      getSql: () => db.sql,
      store: memoryStore(),
      // The site's Clerk session is always the owner of the first agent account.
      verifyClerk: async (token) => {
        if (token !== OWNER_JWT) throw new Error('bad jwt');
        return { userId: 'user_agent_1', sessionId: 'sess_1' };
      },
      verifyOAuth: async (token) => {
        if (token !== 'oat_good') throw new Error('bad oauth token');
        return { userId: 'user_oauth' };
      },
      users: null,
      accounts: postgresAccounts(() => db.sql),
      agentDirectory: directory,
      claimMailer: mailer,
      receivesMail: async (domain) => domain !== 'nomail.test',
    },
  );
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts, agent_signups, jobs cascade`;
  users.clear();
  mails.length = 0;
});

/** Each sign-up from its own IP unless told otherwise, so the per-IP limit stays out of the way. */
async function signup(body: object, ip = `10.0.0.${nextIp++}`) {
  return app.inject({ method: 'POST', url: '/v1/agents/signup', payload: body, remoteAddress: ip });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('agent sign-up', () => {
  it('creates an unclaimed account with a working key and mails the claim link', async () => {
    const res = await signup({ email: 'Ada@Acme.test', agentName: 'Claude' });
    expect(res.statusCode).toBe(201);
    const body = AgentSignupResponse.parse(res.json());
    expect(body.account).toMatchObject({ email: 'ada@acme.test', status: 'unclaimed', claimEmailSent: true });
    expect(body.mcpUrl).toBe('https://api.nvoke.test/mcp');

    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe('ada@acme.test');
    expect(mails[0]!.text).toContain('https://nvoke.test/claim#ticket=ticket_for_user_agent_1');
    expect(mails[0]!.text).toContain('"Claude"');

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(body.apiKey) });
    expect(me.statusCode).toBe(200);
    expect(MeResponse.parse(me.json())).toMatchObject({
      via: 'api_key',
      plan: 'free',
      account: { createdBy: 'agent', agentName: 'Claude', claimedAt: null },
      billingUrl: 'https://nvoke.test/desktop/billing',
    });

    const search = await app.inject({
      method: 'POST',
      url: '/v1/searches',
      headers: bearer(body.apiKey),
      payload: { kind: 'local', params: { niche: 'dentists', location: 'Aarhus' }, limit: 5 },
    });
    expect(search.statusCode).toBe(201);
  });

  it('refuses taken, disposable, mail-less and malformed addresses', async () => {
    expect((await signup({ email: 'ada@acme.test' })).statusCode).toBe(201);
    expect((await signup({ email: 'ada@acme.test' })).json()).toEqual({ error: 'account_exists' });
    expect((await signup({ email: 'x@mailinator.com' })).json()).toEqual({ error: 'email_not_accepted' });
    expect((await signup({ email: 'x@nomail.test' })).json()).toEqual({ error: 'email_not_accepted' });
    expect((await signup({ email: 'not an email' })).statusCode).toBe(400);
  });

  it('limits sign-ups per IP', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await signup({ email: `a${i}@shop${i}.test` }, '10.9.9.9')).statusCode);
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it('stops the key after the active days until a human claims', async () => {
    const { apiKey } = AgentSignupResponse.parse((await signup({ email: 'ada@acme.test' })).json());
    await db.sql`update accounts set created_at = now() - interval '8 days'`;
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(apiKey) });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'claim_required' });
  });

  it('lets the owner claim and keep the agent key', async () => {
    const { apiKey } = AgentSignupResponse.parse((await signup({ email: 'ada@acme.test', agentName: 'Claude' })).json());
    // Reading the account on the claim page claims nothing.
    const status = await app.inject({ method: 'GET', url: '/v1/agents/claim', headers: bearer(OWNER_JWT) });
    expect(status.json()).toEqual({ account: { createdBy: 'agent', agentName: 'Claude', claimedAt: null } });
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(apiKey) })).statusCode).toBe(200);
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/agents/claim',
      headers: bearer(OWNER_JWT),
      payload: { acceptTerms: true, keepAgentKeys: true },
    });
    expect(claim.statusCode).toBe(200);
    const body = ClaimResponse.parse(claim.json());
    expect(body.revokedKeys).toBe(0);
    expect(body.account.claimedAt).not.toBeNull();
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(apiKey) })).statusCode).toBe(200);
  });

  it('revokes the agent key when the owner signs in without the claim link', async () => {
    const { apiKey } = AgentSignupResponse.parse((await signup({ email: 'ada@acme.test' })).json());
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(OWNER_JWT) });
    expect(MeResponse.parse(me.json()).account.claimedAt).not.toBeNull();
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(apiKey) })).statusCode).toBe(401);
  });
});

describe('agent purge', () => {
  it('deletes unclaimed accounts after 30 days with their Clerk user, and keeps claimed ones', async () => {
    await signup({ email: 'old@acme.test' });
    await signup({ email: 'new@acme.test' });
    await db.sql`update accounts set created_at = now() - interval '31 days' where clerk_user_id = 'user_agent_1'`;
    await db.sql`insert into accounts (clerk_user_id, created_at) values ('user_human', now() - interval '400 days')`;
    const deleted: string[] = [];
    const result = await purgeAgentSignups(db.sql, async (id) => void deleted.push(id));
    expect(result.unclaimedAccounts).toBe(1);
    expect(deleted).toEqual(['user_agent_1']);
    const left = await db.sql`select clerk_user_id from accounts order by 1`;
    expect(left.map((r) => r.clerk_user_id)).toEqual(['user_agent_2', 'user_human']);
  });
});

describe('api keys', () => {
  it('creates, lists, uses and revokes keys', async () => {
    const { apiKey } = AgentSignupResponse.parse((await signup({ email: 'ada@acme.test' })).json());
    const created = await app.inject({ method: 'POST', url: '/v1/api-keys', headers: bearer(apiKey), payload: { name: 'CRM sync' } });
    expect(created.statusCode).toBe(201);
    const key = CreateApiKeyResponse.parse(created.json());
    expect(key.key.startsWith(key.prefix)).toBe(true);

    const list = ApiKeyListResponse.parse((await app.inject({ method: 'GET', url: '/v1/api-keys', headers: bearer(key.key) })).json());
    expect(list.apiKeys.map((k) => [k.name, k.origin])).toEqual([
      ['CRM sync', 'user'],
      ['Agent sign-up', 'agent_signup'],
    ]);
    expect(JSON.stringify(list)).not.toContain(key.key);

    const revoked = await app.inject({ method: 'DELETE', url: `/v1/api-keys/${key.id}`, headers: bearer(apiKey) });
    expect(revoked.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(key.key) })).statusCode).toBe(401);
  });

  it('rejects a made up key', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/searches', headers: bearer('nvk_sk_nope') });
    expect(res.statusCode).toBe(401);
  });
});

describe('meta', () => {
  it('serves the plans and an OpenAPI document covering every endpoint', async () => {
    const plans = await app.inject({ method: 'GET', url: '/v1/plans' });
    expect(plans.json().plans[0]).toEqual({ key: 'free', emailsPerMonth: 50, priceUsd: 0 });

    const doc = (await app.inject({ method: 'GET', url: '/v1/openapi.json' })).json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: 'https://api.nvoke.test' }]);
    for (const e of ENDPOINTS) {
      expect(doc.paths[e.path.replace(/:(\w+)/g, '{$1}')]?.[e.method.toLowerCase()]?.operationId, e.id).toBe(e.id);
    }
  });

  it('documents only routes the server has', () => {
    for (const e of ENDPOINTS) {
      expect(app.hasRoute({ method: e.method, url: e.path }), `${e.method} ${e.path}`).toBe(true);
    }
  });
});

describe('mcp', () => {
  const rpc = (token: string | null, body: object) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { ...(token ? bearer(token) : {}), accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      payload: body,
    });

  it('points a client without a token at the OAuth metadata', async () => {
    const res = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer resource_metadata="https://api.nvoke.test/.well-known/oauth-protected-resource/mcp"');
    const meta = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp' })).json();
    expect(meta).toMatchObject({ resource: 'https://api.nvoke.test/mcp', authorization_servers: ['https://clerk.nvoke.test'] });
  });

  it('lists the tools and runs them as the caller', async () => {
    const { apiKey } = AgentSignupResponse.parse((await signup({ email: 'ada@acme.test' })).json());
    const init = await rpc(apiKey, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    expect(init.statusCode).toBe(200);
    expect(init.json().result.instructions).toContain('wait_for_search');

    const tools = await rpc(apiKey, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(tools.json().result.tools.map((t: { name: string }) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));

    const started = await rpc(apiKey, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'start_search', arguments: { kind: 'local', niche: 'dentists', location: 'Aarhus', limit: 5 } },
    });
    const result = started.json().result;
    expect(result.isError).toBe(false);
    const search = Search.parse(JSON.parse(result.content[0].text));
    expect(search).toMatchObject({ kind: 'local', status: 'queued', limit: 5 });

    const list = await rpc(apiKey, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'start_search', arguments: { kind: 'domains', items: ['acme.com', 'Novo Nordisk'], country: 'dk' } },
    });
    expect(list.json().result.isError).toBe(false);
    expect(Search.parse(JSON.parse(list.json().result.content[0].text))).toMatchObject({
      kind: 'domains',
      params: { items: ['acme.com', 'Novo Nordisk'], country: 'dk' },
      limit: 2,
    });

    const missing = await rpc(apiKey, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_search', arguments: { searchId: '00000000-0000-4000-8000-000000000000' } },
    });
    expect(missing.json().result).toMatchObject({ isError: true, content: [{ text: '{"error":"not_found"}' }] });
  });

  it('accepts a Clerk OAuth token', async () => {
    const res = await rpc('oat_good', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.statusCode).toBe(200);
  });

  it('maps every tool to a route', () => {
    for (const tool of MCP_TOOLS) expect(() => toolRequest(tool.name, { searchId: 'x', kind: 'local' })).not.toThrow();
  });

  it('reads the Clerk issuer from a publishable key', () => {
    expect(clerkIssuerFromPublishableKey(`pk_live_${Buffer.from('clerk.nvoke.run$').toString('base64')}`)).toBe('https://clerk.nvoke.run');
    expect(clerkIssuerFromPublishableKey(undefined)).toBeNull();
  });
});
