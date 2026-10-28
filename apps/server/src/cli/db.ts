/**
 *   pnpm --filter @nvoke/server cli db
 *
 * `db` starts the embedded Postgres, applies the migrations, prints its URL
 * and keeps running until Ctrl+C, so `dev:api` and `dev:worker` can use it as
 * DATABASE_URL for a fully local run.
 */
import postgres from 'postgres';
import { applyMigrations } from '../db/migrations.js';
import { startEmbedded, type Command } from './shared.js';

/** `cli db`: a local Postgres with every migration applied, until Ctrl+C. */
async function serveDb(): Promise<void> {
  const local = await startEmbedded();
  const sql = postgres(local.url, { max: 1, onnotice: () => {} });
  const applied = await applyMigrations(sql);
  await sql.end({ timeout: 5 });
  if (applied.length > 0) console.log(`applied migrations: ${applied.join(', ')}`);
  console.log(`local Postgres ready. Use it as DATABASE_URL:
  ${local.url}
Ctrl+C stops it.`);
  await new Promise<void>((resolveStop) => {
    process.once('SIGINT', resolveStop);
    process.once('SIGTERM', resolveStop);
  });
  await local.stop();
}

export const dbCommand: Command = {
  name: 'db',
  usage: ['  cli db'],
  run: () => serveDb(),
};
