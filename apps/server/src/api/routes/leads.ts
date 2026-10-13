// The /v1 lead routes (docs/SPEC.md, "API"). Registered as one plugin that
// expects request.userId to be set by an upstream auth preHandler. app.ts
// passes `app.requireAuth` (device token or Clerk JWT) as `authenticate`,
// which also creates the account on the first authenticated request.

import type { FastifyPluginAsync, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import type { Sql } from 'postgres';
import type { z } from 'zod';
import {
  CompaniesQuery,
  CreateSearchRequest,
  LeadFilters,
  SEARCH_LIMIT_DEFAULT,
  SearchIdParams,
  type CompaniesPage,
  type LeadsErrorCode,
  type Search,
  type SearchListResponse,
} from '@nvoke/shared';
import { toCsv } from '../../leads/csv.js';
import { MAX_SEARCH_LIMIT } from '../../leads/plans.js';
import { ensureAccount, quotaExhausted } from '../../leads/quota.js';
import {
  cancelSearch,
  createSearch,
  deleteSearch,
  exportRows,
  getSearch,
  listCompanies,
  listSearches,
} from '../../leads/repo.js';
import { requireUser } from '../user.js';

export interface LeadsRoutesOptions {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  /** Upstream auth that sets request.userId. Optional when an outer scope already ran it. */
  authenticate?: preHandlerAsyncHookHandler;
}

function sendError(reply: FastifyReply, status: number, error: LeadsErrorCode, details?: unknown) {
  return reply.code(status).send(details === undefined ? { error } : { error, details });
}

function parse<T extends z.ZodType>(schema: T, value: unknown): { ok: true; data: z.infer<T> } | { ok: false; issues: unknown } {
  const result = schema.safeParse(value);
  return result.success ? { ok: true, data: result.data } : { ok: false, issues: result.error.issues };
}

export const leadsRoutes: FastifyPluginAsync<LeadsRoutesOptions> = async (app, opts) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Error && err.message === 'DATABASE_URL is not set') {
      return sendError(reply, 503, 'database_unavailable');
    }
    req.log.error({ err }, 'lead route failed');
    const status = typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : (err as Error).message });
  });

  if (opts.authenticate) app.addHook('preHandler', opts.authenticate);
  app.addHook('preHandler', requireUser);

  app.post('/searches', async (req, reply): Promise<Search | void> => {
    const body = parse(CreateSearchRequest, req.body);
    if (!body.ok) return sendError(reply, 400, 'invalid_request', body.issues);
    const sql = opts.getSql();
    const userId = req.userId!;
    await ensureAccount(sql, userId);
    if (await quotaExhausted(sql, userId)) return sendError(reply, 403, 'quota_exceeded');
    const limit = Math.min(body.data.limit ?? SEARCH_LIMIT_DEFAULT, MAX_SEARCH_LIMIT);
    const search = await createSearch(sql, userId, body.data, limit);
    return reply.code(201).send(search);
  });

  app.get('/searches', async (req): Promise<SearchListResponse> => {
    return { searches: await listSearches(opts.getSql(), req.userId!) };
  });

  app.get('/searches/:id', async (req, reply): Promise<Search | void> => {
    const params = parse(SearchIdParams, req.params);
    if (!params.ok) return sendError(reply, 404, 'not_found');
    const search = await getSearch(opts.getSql(), req.userId!, params.data.id);
    return search ?? sendError(reply, 404, 'not_found');
  });

  app.post('/searches/:id/cancel', async (req, reply): Promise<Search | void> => {
    const params = parse(SearchIdParams, req.params);
    if (!params.ok) return sendError(reply, 404, 'not_found');
    const result = await cancelSearch(opts.getSql(), req.userId!, params.data.id);
    if (result === null) return sendError(reply, 404, 'not_found');
    if (result === false) return sendError(reply, 409, 'not_cancelable');
    return result;
  });

  app.delete('/searches/:id', async (req, reply) => {
    const params = parse(SearchIdParams, req.params);
    if (!params.ok) return sendError(reply, 404, 'not_found');
    const deleted = await deleteSearch(opts.getSql(), req.userId!, params.data.id);
    if (!deleted) return sendError(reply, 404, 'not_found');
    return reply.code(204).send();
  });

  app.get('/searches/:id/companies', async (req, reply): Promise<CompaniesPage | void> => {
    const params = parse(SearchIdParams, req.params);
    if (!params.ok) return sendError(reply, 404, 'not_found');
    const query = parse(CompaniesQuery, req.query);
    if (!query.ok) return sendError(reply, 400, 'invalid_request', query.issues);
    const sql = opts.getSql();
    if (!(await getSearch(sql, req.userId!, params.data.id))) return sendError(reply, 404, 'not_found');
    const page = await listCompanies(sql, req.userId!, params.data.id, query.data);
    if (!page) return sendError(reply, 400, 'invalid_request', [{ message: 'invalid cursor', path: ['cursor'] }]);
    return page;
  });

  app.get('/searches/:id/export.csv', async (req, reply) => {
    const params = parse(SearchIdParams, req.params);
    if (!params.ok) return sendError(reply, 404, 'not_found');
    const filters = parse(LeadFilters, req.query);
    if (!filters.ok) return sendError(reply, 400, 'invalid_request', filters.issues);
    const sql = opts.getSql();
    if (!(await getSearch(sql, req.userId!, params.data.id))) return sendError(reply, 404, 'not_found');
    const rows = await exportRows(sql, req.userId!, params.data.id, filters.data);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="nvoke-${params.data.id.slice(0, 8)}.csv"`)
      .header('cache-control', 'no-store')
      .send(toCsv(rows));
  });
};
