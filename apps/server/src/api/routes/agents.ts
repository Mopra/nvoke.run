// Agent sign-up and claiming (docs/spec/api-and-agents.md).
//
//   POST /v1/agents/signup  (public)          -> account + API key, claim email to the owner
//   GET  /v1/agents/claim   (Clerk session)   -> the account as the claim page shows it, claims nothing
//   POST /v1/agents/claim   (Clerk session)   -> the owner takes the account over

import type { FastifyInstance } from 'fastify';
import { AgentSignupRequest, ClaimRequest, type ClaimResponse, type ClaimStatusResponse } from '@nvoke/shared';
import { agentSignup, type AgentDirectory, type ClaimMailer, type SignupDeps } from '../../agents/signup.js';
import { claimAccount } from '../../leads/accounts.js';
import { accountSummary } from '../../leads/quota.js';
import { clerkAgentDirectory, day3ClaimMailer } from '../../agents/providers.js';
import type { RouteContext } from './context.js';

export async function agentRoutes(app: FastifyInstance, opts: Omit<SignupDeps, 'log'>): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return reply.code(503).send({ error: 'database_unavailable' });
    }
    req.log.error({ err }, 'agent route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.post('/signup', async (req, reply) => {
    const body = AgentSignupRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const result = await agentSignup({ ...opts, log: req.log }, body.data, req.ip);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return reply.code(201).header('cache-control', 'no-store').send(result.response);
  });

  app.get('/claim', { preHandler: app.requireClerkSession, config: { claimRoute: true } }, async (req) => {
    const summary = await accountSummary(opts.getSql(), req.auth!.userId);
    const res: ClaimStatusResponse = { account: summary.account };
    return res;
  });

  app.post('/claim', { preHandler: app.requireClerkSession, config: { claimRoute: true } }, async (req, reply) => {
    const body = ClaimRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request', details: body.error.issues });
    const sql = opts.getSql();
    const userId = req.auth!.userId;
    const revoked = await claimAccount(sql, userId, { keepAgentKeys: body.data.keepAgentKeys });
    const summary = await accountSummary(sql, userId);
    const res: ClaimResponse = { account: summary.account, revokedKeys: revoked ?? 0 };
    return res;
  });
}

/** Test overrides for agent sign-up. */
export interface AgentsOverrides {
  /** Creates Clerk users for agent sign-up. Null switches sign-up off. */
  agentDirectory: AgentDirectory | null;
  claimMailer: ClaimMailer | null;
  /** True when the domain takes mail. Tests stub DNS out. */
  receivesMail?: (domain: string) => Promise<boolean>;
}

export async function registerAgents(
  app: FastifyInstance,
  { env, getSql, overrides }: RouteContext<AgentsOverrides>,
): Promise<void> {
  const directory =
    overrides.agentDirectory !== undefined
      ? overrides.agentDirectory
      : env.CLERK_SECRET_KEY
        ? clerkAgentDirectory(env.CLERK_SECRET_KEY)
        : null;
  const mailer =
    overrides.claimMailer !== undefined
      ? overrides.claimMailer
      : env.DAY3_API_KEY
        ? day3ClaimMailer({ apiKey: env.DAY3_API_KEY, from: env.CLAIM_EMAIL_FROM, log: app.log })
        : null;
  await app.register(agentRoutes, {
    prefix: '/v1/agents',
    getSql,
    directory,
    mailer,
    enabled: env.AGENT_SIGNUP_ENABLED,
    siteUrl: env.SITE_URL,
    apiUrl: env.PUBLIC_API_URL,
    receivesMail: overrides.receivesMail,
  });
}
