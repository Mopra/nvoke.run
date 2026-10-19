// The /v1/drops routes (docs/SPEC.md, "Drops"). Same auth as the lead
// routes: `authenticate` sets request.userId and requireUser guards.

import type { FastifyPluginAsync, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import {
  CreateDropRequest,
  DropIdParams,
  UpdateDropRequest,
  type Drop,
  type DropListResponse,
  type FeedSource,
} from '@nvoke/shared';
import {
  MAX_DROPS_PER_USER,
  countDrops,
  createDrop,
  deleteDrop,
  feedSourceStatus,
  listDrops,
  runDropNow,
  updateDrop,
} from '../../feed/drops.js';
import { maxDropDailyLimit } from '../../leads/plans.js';
import { ensureAccount } from '../../leads/quota.js';
import { requireUser } from '../user.js';

export interface DropsRoutesOptions {
  getSql: () => Sql;
  authenticate?: preHandlerAsyncHookHandler;
  /** Which feed sources the worker can collect, for the source list. */
  sourcesAvailable: Record<FeedSource, boolean>;
}

type DropsErrorCode = 'not_found' | 'invalid_request' | 'too_many_drops' | 'database_unavailable';

/** The daily limit held to what the plan allows, like a search's limit. */
function withPlanLimit<T extends { dailyLimit?: number }>(req: T, plan: string): T {
  return req.dailyLimit === undefined ? req : { ...req, dailyLimit: Math.min(req.dailyLimit, maxDropDailyLimit(plan)) };
}

function sendError(reply: FastifyReply, status: number, error: DropsErrorCode, details?: unknown) {
  return reply.code(status).send(details === undefined ? { error } : { error, details });
}

export const dropsRoutes: FastifyPluginAsync<DropsRoutesOptions> = async (app, opts) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return sendError(reply, 503, 'database_unavailable');
    }
    req.log.error({ err }, 'drop route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });

  if (opts.authenticate) app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);

  app.get('/drops', async (req): Promise<DropListResponse> => {
    const sql = opts.getSql();
    return {
      drops: await listDrops(sql, req.userId!),
      sources: await feedSourceStatus(sql, opts.sourcesAvailable),
    };
  });

  app.post('/drops', async (req, reply): Promise<Drop | void> => {
    const body = CreateDropRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    const sql = opts.getSql();
    const plan = await ensureAccount(sql, req.userId!);
    if ((await countDrops(sql, req.userId!)) >= MAX_DROPS_PER_USER) return sendError(reply, 409, 'too_many_drops');
    return reply.code(201).send(await createDrop(sql, req.userId!, withPlanLimit(body.data, plan)));
  });

  app.patch('/drops/:id', async (req, reply): Promise<Drop | void> => {
    const params = DropIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = UpdateDropRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    const sql = opts.getSql();
    const plan = await ensureAccount(sql, req.userId!);
    const drop = await updateDrop(sql, req.userId!, params.data.id, withPlanLimit(body.data, plan));
    return drop ?? sendError(reply, 404, 'not_found');
  });

  app.post('/drops/:id/run', async (req, reply): Promise<Drop | void> => {
    const params = DropIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const drop = await runDropNow(opts.getSql(), req.userId!, params.data.id);
    return drop ?? sendError(reply, 404, 'not_found');
  });

  app.delete('/drops/:id', async (req, reply) => {
    const params = DropIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    if (!(await deleteDrop(opts.getSql(), req.userId!, params.data.id))) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });
};
