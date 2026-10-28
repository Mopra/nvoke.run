/** What the CLI commands share: parsed arguments, usage, the local and operator databases. */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';
import { applyMigrations } from '../db/migrations.js';

export const CLI_USER = 'cli-local-user';
/** apps/server, from src/cli or dist/cli. */
export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BENCH_DIR = join(SERVER_DIR, '.bench');

export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
  /** Every value of a flag, in order, for one given more than once (--sender a --sender b). */
  lists: Map<string, string[]>;
}

/** One top-level command: `cli <name> ...`. */
export interface Command {
  name: string;
  /** Its lines of the combined usage text, in print order. */
  usage: readonly string[];
  run(args: Args): Promise<void>;
}

let usageText = '';

/** Set once by cli/index.ts from every command's usage lines. */
export function setUsage(text: string): void {
  usageText = text;
}

export function usage(): never {
  console.error(usageText);
  process.exit(2);
}

export interface LocalDb {
  url: string;
  stop(): Promise<void>;
}

export async function startEmbedded(): Promise<LocalDb> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = join(SERVER_DIR, '.pgdata');
  const port = Number(process.env.CLI_PG_PORT ?? 54329);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(join(dir, 'PG_VERSION'))) {
    console.log(`initialising local Postgres in ${dir}`);
    await pg.initialise();
  }
  await pg.start();
  const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
  const [db] = await admin`select pg_encoding_to_char(encoding) as encoding from pg_database where datname = 'nvoke_cli'`;
  if (db && db.encoding !== 'UTF8') {
    // An older dev database made with the Windows codepage cannot hold real text (feed collectors fail).
    console.log(`nvoke_cli was ${db.encoding}, recreating it as UTF8 (local dev data is dropped)`);
    await admin.unsafe('drop database nvoke_cli with (force)');
  }
  if (!db || db.encoding !== 'UTF8') {
    await admin.unsafe("create database nvoke_cli template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'");
  }
  await admin.end();
  return { url: `postgres://postgres:postgres@127.0.0.1:${port}/nvoke_cli`, stop: () => pg.stop() };
}

/**
 * The database for operator commands: --database-url, then DATABASE_URL with
 * --prod, then CLI_DATABASE_URL or the embedded Postgres. Prints which.
 */
export async function opsDatabase(args: Args): Promise<{ sql: Sql; close: () => Promise<void> }> {
  const explicitUrl = args.flags.get('database-url');
  const url =
    (typeof explicitUrl === 'string' ? explicitUrl : undefined) ??
    (args.flags.has('prod') ? process.env.DATABASE_URL : undefined) ??
    process.env.CLI_DATABASE_URL;
  const local = url ? null : await startEmbedded();
  const target = new URL(url ?? local!.url);
  console.error(`database: ${target.hostname}:${target.port || 5432}${target.pathname}`);
  const sql = postgres(url ?? local!.url, { max: 4, onnotice: () => {} });
  if (local) await applyMigrations(sql);
  return {
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
      await local?.stop();
    },
  };
}
