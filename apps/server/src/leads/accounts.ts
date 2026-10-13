// The account behind an authenticated user: created on the first
// authenticated request, then read for plan and usage by GET /v1/me.

import type { Sql } from 'postgres';
import type { AccountSummary } from '@nvoke/shared';
import { accountSummary, ensureAccount } from './quota.js';

export interface Accounts {
  /** Creates the accounts row if this user has none yet. */
  ensure(userId: string): Promise<void>;
  /** Plan and usage for this period. */
  summary(userId: string): Promise<AccountSummary>;
}

/**
 * Postgres backed accounts. Remembers which users already have a row, so
 * ensure() costs one query per user per process, not one per request.
 */
export function postgresAccounts(getSql: () => Sql): Accounts {
  const known = new Set<string>();
  return {
    async ensure(userId) {
      if (known.has(userId)) return;
      await ensureAccount(getSql(), userId);
      if (known.size > 50_000) known.clear();
      known.add(userId);
    },
    summary: (userId) => accountSummary(getSql(), userId),
  };
}
