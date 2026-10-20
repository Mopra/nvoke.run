// The sending routes (docs/sending/plan.md, "API"): mailboxes, campaigns,
// their leads and written emails, replies and the summary. Same auth as the
// drop routes: `authenticate` sets request.userId and requireUser guards.
// Agents and API keys can draft and read; start and resume take a person
// signed in to the web app (a Clerk session), and so does changing what a
// started campaign sends (its steps, mailboxes or a written email). Without SECRETS_KEY nothing
// can be sealed or opened, so every route but the summary answers 503.
// Sending is internal only (docs/sending/plan.md, "Internal only"): an
// account outside SENDING_USERS gets 404 on every route here, as if none
// existed, before any other check.

import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import {
  CampaignLeadParams,
  CampaignLeadsQuery,
  CampaignStepParams,
  ConnectMailboxRequest,
  CreateCampaignRequest,
  ReplyListQuery,
  SendingIdParams,
  UpdateCampaignRequest,
  UpdateMailboxRequest,
  UpdateWrittenStepRequest,
} from '@nvoke/shared';
import type { Secrets } from '../../crypto/secrets.js';
import { loadEnv } from '../../env.js';
import {
  CampaignError,
  type CampaignErrorCode,
  createCampaign,
  deleteCampaign,
  getCampaign,
  getCampaignLead,
  listCampaignLeads,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
  stopLead,
  updateCampaign,
  updateWrittenStep,
} from '../../sending/campaigns.js';
import {
  MailboxError,
  checkMailbox,
  connectMailbox,
  deleteMailbox,
  getMailbox,
  listMailboxes,
  updateMailbox,
  type MailboxDeps,
} from '../../sending/mailboxes.js';
import { listReplies, markReplyRead, sendingSummary } from '../../sending/queries.js';
import type { TransportFactory } from '../../sending/types.js';
import { requireUser } from '../user.js';

export interface SendingRoutesOptions {
  getSql: () => Sql;
  authenticate?: preHandlerAsyncHookHandler;
  /** Null when SECRETS_KEY is unset: sending is unavailable. */
  secrets: Secrets | null;
  /** SENDING_ENABLED. Off, the summary says unavailable; drafting still works. */
  enabled: boolean;
  transport: TransportFactory;
  log: Logger;
  /** SENDING_USERS: the Clerk user ids allowed to send. Read from the environment when left out. */
  users?: readonly string[];
}

function sendError(reply: FastifyReply, status: number, error: string, details?: unknown) {
  return reply.code(status).send(details === undefined ? { error } : { error, details });
}

/** Status and API code per MailboxError and CampaignError code. */
const MAILBOX_ERRORS: Record<MailboxError['code'], [number, string]> = {
  too_many_mailboxes: [409, 'too_many_mailboxes'],
  exists: [409, 'mailbox_exists'],
  not_found: [404, 'not_found'],
};
const CAMPAIGN_ERRORS: Record<CampaignErrorCode, number> = {
  not_found: 404,
  bad_mailbox: 400,
  no_leads: 422,
  too_many_campaigns: 409,
  bad_state: 409,
};

/** Campaign states past Start: their emails go out as they stand. */
const STARTED = new Set(['scheduled', 'sending', 'paused']);

export const sendingRoutes: FastifyPluginAsync<SendingRoutesOptions> = async (app, opts) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof MailboxError) {
      const [status, code] = MAILBOX_ERRORS[err.code];
      return reply.code(status).send({ error: code, detail: err.message });
    }
    if (err instanceof CampaignError) return reply.code(CAMPAIGN_ERRORS[err.code]).send({ error: err.code, detail: err.message });
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return sendError(reply, 503, 'database_unavailable');
    }
    // Fastify's own errors (a body that is not JSON, say) keep their status.
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return sendError(reply, status, 'invalid_request');
    req.log.error({ err }, 'sending route failed');
    return reply.code(500).send({ error: 'internal_error' });
  });

  if (opts.authenticate) app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);
  const allowed = new Set(opts.users ?? loadEnv().SENDING_USERS);
  app.addHook('preHandler', async (req, reply) => {
    if (!allowed.has(req.userId!)) return sendError(reply, 404, 'not_found');
  });

  /** Every route but the summary needs the secrets. */
  const available: preHandlerAsyncHookHandler = async (_req, reply) => {
    if (!opts.secrets) return sendError(reply, 503, 'sending_unavailable');
  };
  /** Start and resume: a person in the web app, never a key, token or agent. */
  const person: preHandlerAsyncHookHandler = async (req, reply) => {
    if (req.auth?.via !== 'clerk') return sendError(reply, 403, 'session_required');
  };
  /**
   * Once a campaign has started, what it sends goes out without another
   * review, so only a person may change it. Someone else's campaign or a
   * missing one passes through to the 404 below.
   */
  const startedNeedsPerson = async (req: FastifyRequest, reply: FastifyReply, campaignId: string): Promise<boolean> => {
    if (req.auth?.via === 'clerk') return false;
    const [row] = await opts.getSql()<{ status: string }[]>`
      select status from campaigns where id = ${campaignId} and clerk_user_id = ${req.userId!}`;
    if (!row || !STARTED.has(row.status)) return false;
    await sendError(reply, 403, 'session_required');
    return true;
  };
  const guarded = { preHandler: available };
  const byPerson = { preHandler: [available, person] };

  const mailboxDeps = (): MailboxDeps => ({ sql: opts.getSql(), secrets: opts.secrets!, transport: opts.transport, log: opts.log });
  const idOf = (req: FastifyRequest) => {
    const params = SendingIdParams.safeParse(req.params);
    return params.success ? params.data.id : null;
  };

  app.get('/sending', async (req) => sendingSummary(opts.getSql(), req.userId!, Boolean(opts.secrets) && opts.enabled));

  // Mailboxes

  app.get('/mailboxes', guarded, async (req) => ({ mailboxes: await listMailboxes(opts.getSql(), req.userId!) }));

  app.post('/mailboxes', guarded, async (req, reply) => {
    const body = ConnectMailboxRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    return reply.code(201).send(await connectMailbox(mailboxDeps(), req.userId!, body.data));
  });

  app.patch('/mailboxes/:id', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id) return sendError(reply, 404, 'not_found');
    const body = UpdateMailboxRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    return (await updateMailbox(mailboxDeps(), req.userId!, id, body.data)) ?? sendError(reply, 404, 'not_found');
  });

  app.delete('/mailboxes/:id', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id || !(await deleteMailbox(opts.getSql(), req.userId!, id))) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  app.post('/mailboxes/:id/check', guarded, async (req, reply) => {
    const id = idOf(req);
    const sql = opts.getSql();
    if (!id || !(await getMailbox(sql, req.userId!, id))) return sendError(reply, 404, 'not_found');
    await checkMailbox(mailboxDeps(), id);
    return (await getMailbox(sql, req.userId!, id)) ?? sendError(reply, 404, 'not_found');
  });

  // Campaigns

  app.get('/campaigns', guarded, async (req) => ({ campaigns: await listCampaigns(opts.getSql(), req.userId!) }));

  app.post('/campaigns', guarded, async (req, reply) => {
    const body = CreateCampaignRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    return reply.code(201).send(await createCampaign(opts.getSql(), req.userId!, body.data));
  });

  app.get('/campaigns/:id', guarded, async (req, reply) => {
    const id = idOf(req);
    return (id && (await getCampaign(opts.getSql(), req.userId!, id))) || sendError(reply, 404, 'not_found');
  });

  app.patch('/campaigns/:id', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id) return sendError(reply, 404, 'not_found');
    const body = UpdateCampaignRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    if (await startedNeedsPerson(req, reply, id)) return reply;
    return (await updateCampaign(opts.getSql(), req.userId!, id, body.data)) ?? sendError(reply, 404, 'not_found');
  });

  app.delete('/campaigns/:id', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id || !(await deleteCampaign(opts.getSql(), req.userId!, id))) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  app.post('/campaigns/:id/start', byPerson, async (req, reply) => {
    const id = idOf(req);
    return (id && (await startCampaign(opts.getSql(), req.userId!, id))) || sendError(reply, 404, 'not_found');
  });

  app.post('/campaigns/:id/pause', guarded, async (req, reply) => {
    const id = idOf(req);
    return (id && (await pauseCampaign(opts.getSql(), req.userId!, id))) || sendError(reply, 404, 'not_found');
  });

  app.post('/campaigns/:id/resume', byPerson, async (req, reply) => {
    const id = idOf(req);
    return (id && (await resumeCampaign(opts.getSql(), req.userId!, id))) || sendError(reply, 404, 'not_found');
  });

  // A campaign's leads and their written emails

  app.get('/campaigns/:id/leads', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id) return sendError(reply, 404, 'not_found');
    const query = CampaignLeadsQuery.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'invalid_request', query.error.issues);
    return (await listCampaignLeads(opts.getSql(), req.userId!, id, query.data)) ?? sendError(reply, 404, 'not_found');
  });

  app.get('/campaigns/:id/leads/:leadId', guarded, async (req, reply) => {
    const params = CampaignLeadParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    return (await getCampaignLead(opts.getSql(), req.userId!, params.data.id, params.data.leadId)) ?? sendError(reply, 404, 'not_found');
  });

  app.patch('/campaigns/:id/leads/:leadId/steps/:step', guarded, async (req, reply) => {
    const params = CampaignStepParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = UpdateWrittenStepRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues);
    const { id, leadId, step } = params.data;
    if (await startedNeedsPerson(req, reply, id)) return reply;
    return (await updateWrittenStep(opts.getSql(), req.userId!, id, leadId, step, body.data)) ?? sendError(reply, 404, 'not_found');
  });

  app.post('/campaigns/:id/leads/:leadId/stop', guarded, async (req, reply) => {
    const params = CampaignLeadParams.safeParse(req.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    return (await stopLead(opts.getSql(), req.userId!, params.data.id, params.data.leadId)) ?? sendError(reply, 404, 'not_found');
  });

  // Replies

  app.get('/replies', guarded, async (req, reply) => {
    const query = ReplyListQuery.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'invalid_request', query.error.issues);
    return (await listReplies(opts.getSql(), req.userId!, query.data)) ?? sendError(reply, 400, 'invalid_request');
  });

  app.post('/replies/:id/read', guarded, async (req, reply) => {
    const id = idOf(req);
    if (!id || !(await markReplyRead(opts.getSql(), req.userId!, id))) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });
};
