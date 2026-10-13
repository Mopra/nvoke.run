// Agent sign-up and claiming (docs/SPEC.md, "API and agents").
//
//   POST /v1/agents/signup  (public)          -> account + API key, claim email to the owner
//   POST /v1/agents/claim   (Clerk session)   -> the owner takes the account over

import type { FastifyInstance } from 'fastify';
import { AgentSignupRequest, ClaimRequest, type ClaimResponse } from '@nvoke/shared';
import { agentSignup, type SignupDeps } from '../../agents/signup.js';
import { claimAccount } from '../../leads/accounts.js';
import { accountSummary } from '../../leads/quota.js';

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
