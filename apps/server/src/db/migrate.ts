/**
 * Applies every migrations/*.sql not yet recorded in _migrations, in filename
 * order, each in its own transaction. Same approach as Probe.
 *
 *   pnpm migrate
 *   pnpm migrate --dry
 */
import postgres from 'postgres';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';
import { MIGRATIONS_DIR, applyMigrations, pendingMigrations, readMigrations } from './migrations.js';

const log = logger('migrate');

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const url = loadEnv().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  if (readMigrations().length === 0) {
    log.info({ dir: MIGRATIONS_DIR }, 'no migrations found');
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const pending = await pendingMigrations(sql);
    if (pending.length === 0) {
      log.info('up to date');
      return;
    }
    if (dry) {
      log.info({ ids: pending.map((m) => m.id) }, 'pending migrations');
      return;
    }
    await applyMigrations(sql, (id) => log.info({ id }, 'applied'));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'migration failed');
  process.exitCode = 1;
});
