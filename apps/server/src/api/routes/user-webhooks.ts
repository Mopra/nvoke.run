// The /v1/webhooks routes (docs/SPEC.md, "Webhooks"): the user's own
// endpoints. Not to be confused with webhooks.ts, which takes Clerk's.

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookIdParams,
  type PingPayload,
  type Webhook,
  type WebhookDeliveryListResponse,
  type WebhookListResponse,
  type WebhookTestResponse,
} from '@nvoke/shared';
import { ensureAccount } from '../../leads/quota.js';
import { checkUrl, WebhookUrlError, type Resolve, type UrlPolicy } from '../../webhooks/address.js';
import {
  createWebhook,
  deleteWebhook,
  getWebhookRow,
  listDeliveries,
  listWebhooks,
  ownsDrop,
  updateWebhook,
} from '../../webhooks/repo.js';
import type { WebhookSender } from '../../webhooks/send.js';
import { requireUser } from '../user.js';

export interface UserWebhookRoutesOptions {
  getSql: () => Sql;
  authenticate?: preHandlerAsyncHookHandler;
  urlPolicy: UrlPolicy;
  /** Sends the test ping. */
  send: WebhookSender;
  /** DNS for the URL check. Tests stub it. */
  resolve?: Resolve;
}

type ErrorCode = 'not_found' | 'invalid_request' | 'too_many_webhooks' | 'webhook_url_not_allowed' | 'database_unavailable';

function sendError(reply: FastifyReply, status: number, error: ErrorCode, details?: unknown) {
  return reply.code(status).send(details === undefined ? { error } : { error, details });
}

export const userWebhookRoutes: FastifyPluginAsync<UserWebhookRoutesOptions> = async (app, opts) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return sendError(reply, 503, 'database_unavailable');
    }
    req.log.error({ err }, 'webhook route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });

  if (opts.authenticate) app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);

  /** Null when the URL may be used, else the reason it may not. */
  async function urlProblem(url: string): Promise<string | null> {
    try {
      await checkUrl(url, opts.urlPolicy, opts.resolve);
      return null;
    } catch (err) {
      if (err instanceof WebhookUrlError) return err.message;
      throw err;
    }
  }

  app.get('/webhooks', async (req): Promise<WebhookListResponse> => ({
    webhooks: await listWebhooks(opts.getSql(), req.userId!),
  }));

  app.post('/webhooks', async (req, reply) => {
    const body = CreateWebhookRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    const problem = await urlProblem(body.data.url);
    if (problem) return sendError(reply, 422, 'webhook_url_not_allowed', problem);
    const sql = opts.getSql();
    await ensureAccount(sql, req.userId!);
    if (body.data.dropId && !(await ownsDrop(sql, req.userId!, body.data.dropId))) {
      return sendError(reply, 400, 'invalid_request', 'no such drop');
    }
    const created = await createWebhook(sql, req.userId!, body.data);
    if (!created) return sendError(reply, 409, 'too_many_webhooks');
    return reply.code(201).header('cache-control', 'no-store').send(created);
  });

  app.patch('/webhooks/:id', async (req, reply): Promise<Webhook | void> => {
    const params = WebhookIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = UpdateWebhookRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    if (body.data.url) {
      const problem = await urlProblem(body.data.url);
      if (problem) return sendError(reply, 422, 'webhook_url_not_allowed', problem);
    }
    const sql = opts.getSql();
    if (body.data.dropId && !(await ownsDrop(sql, req.userId!, body.data.dropId))) {
      return sendError(reply, 400, 'invalid_request', 'no such drop');
    }
    const webhook = await updateWebhook(sql, req.userId!, params.data.id, body.data);
    return webhook ?? sendError(reply, 404, 'not_found');
  });

  app.delete('/webhooks/:id', async (req, reply) => {
    const params = WebhookIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    if (!(await deleteWebhook(opts.getSql(), req.userId!, params.data.id))) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  app.post('/webhooks/:id/test', async (req, reply): Promise<WebhookTestResponse | void> => {
    const params = WebhookIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const row = await getWebhookRow(opts.getSql(), req.userId!, params.data.id);
    if (!row) return sendError(reply, 404, 'not_found');
    const problem = await urlProblem(row.url);
    if (problem) return sendError(reply, 422, 'webhook_url_not_allowed', problem);
    const now = new Date();
    const payload: PingPayload = { type: 'ping', timestamp: now.toISOString(), data: { webhookId: row.id } };
    return opts.send({ url: row.url, secret: row.secret, id: randomUUID(), body: JSON.stringify(payload), now });
  });

  app.get('/webhooks/:id/deliveries', async (req, reply): Promise<WebhookDeliveryListResponse | void> => {
    const params = WebhookIdParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const deliveries = await listDeliveries(opts.getSql(), req.userId!, params.data.id);
    return deliveries ? { deliveries } : sendError(reply, 404, 'not_found');
  });
};
