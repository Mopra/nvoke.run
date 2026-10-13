import type { Sql } from 'postgres';
import type { Verification } from '@nvoke/shared';
import { ttlFor, type VerifyCache, type VerifyResult } from './index.js';

/** The email_checks table as a verification cache, fresh for ttlFor(verification). */
export function dbVerifyCache(sql: Sql, now: () => number = Date.now): VerifyCache {
  return {
    async get(address) {
      const rows = await sql<{ verification: Verification; mx_host: string | null; reason: string | null; checked_at: Date }[]>`
        select verification, mx_host, reason, checked_at from email_checks where address = ${address}
      `;
      const row = rows[0];
      if (!row) return null;
      if (now() - row.checked_at.getTime() > ttlFor(row.verification)) return null;
      return { address, verification: row.verification, mxHost: row.mx_host, reason: row.reason ?? 'cached' };
    },
    async set(result: VerifyResult) {
      await sql`
        insert into email_checks (address, verification, mx_host, reason, checked_at)
        values (${result.address}, ${result.verification}, ${result.mxHost}, ${result.reason}, ${new Date(now())})
        on conflict (address) do update
        set verification = excluded.verification, mx_host = excluded.mx_host,
            reason = excluded.reason, checked_at = excluded.checked_at
      `;
    },
  };
}
