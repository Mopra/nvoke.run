import postgres, { type Sql } from 'postgres';
import { loadEnv } from '../env.js';

let sql: Sql | null = null;

/**
 * Lazily creates the single connection pool, so the API can boot (and serve
 * /health) without a database configured.
 */
export function getSql(): Sql {
  if (sql) return sql;
  const url = loadEnv().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    onnotice: () => {},
  });
  return sql;
}

export async function closeSql(): Promise<void> {
  if (!sql) return;
  const current = sql;
  sql = null;
  await current.end({ timeout: 5 });
}
