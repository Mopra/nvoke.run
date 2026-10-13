/**
 * Applies every migrations/*.sql not yet recorded in _migrations, in filename
 * order, each in its own transaction. Same approach as Probe.
 *
 *   pnpm migrate
 *   pnpm migrate --dry
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';

const log = logger('migrate');
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

interface Migration {
  id: string;
  sql: string;
}

function readMigrations(): Migration[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      id: f.replace(/\.sql$/, ''),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
    }));
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const url = loadEnv().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const all = readMigrations();
  if (all.length === 0) {
    log.info({ dir: MIGRATIONS_DIR }, 'no migrations found');
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`
      create table if not exists _migrations (
        id         text primary key,
        applied_at timestamptz not null default now()
      )
    `;
    // Keep the bookkeeping table out of the Supabase REST API too.
    await sql`alter table _migrations enable row level security`;
    const applied = new Set((await sql<{ id: string }[]>`select id from _migrations`).map((r) => r.id));
    const pending = all.filter((m) => !applied.has(m.id));

    if (pending.length === 0) {
      log.info({ applied: applied.size }, 'up to date');
      return;
    }
    if (dry) {
      log.info({ ids: pending.map((m) => m.id) }, 'pending migrations');
      return;
    }
    for (const m of pending) {
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`insert into _migrations (id) values (${m.id})`;
      });
      log.info({ id: m.id }, 'applied');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'migration failed');
  process.exitCode = 1;
});
