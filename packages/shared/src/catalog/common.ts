// Catalog parts every group shares: the common error codes and the searchId argument of the MCP tools.

import { z } from 'zod';

export const searchId = z.uuid().describe('The search id from start_search or list_searches.');

/** The token is missing or wrong. */
export const authErrors: Record<string, string> = {
  unauthorized: 'No valid token. Send `Authorization: Bearer <key>`.',
};

/** A bad request, or something that is not there. */
export const requestErrors: Record<string, string> = {
  invalid_request: 'The body or query failed validation. `details` lists the problems.',
  not_found: 'No such search, company, email, drop, key or webhook on this account.',
};

/** Too many requests. */
export const rateErrors: Record<string, string> = {
  rate_limited: 'Too many requests of this kind from this account or client. Try again later.',
};

/** Our side is down. */
export const serverErrors: Record<string, string> = {
  database_unavailable: 'Our database is unreachable. Retry with backoff.',
};
