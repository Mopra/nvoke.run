import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export interface Migration {
  id: string;
  sql: string;
}

export function readMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      id: f.replace(/\.sql$/, ''),
      sql: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
}

/** Ids of migrations not yet recorded in _migrations. Creates the table if needed. */
export async function pendingMigrations(sql: Sql, all: Migration[] = readMigrations()): Promise<Migration[]> {
  await sql`
    create table if not exists _migrations (
      id         text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  const applied = new Set((await sql<{ id: string }[]>`select id from _migrations`).map((r) => r.id));
  return all.filter((m) => !applied.has(m.id));
}

/** Applies every pending migration in filename order, each in its own transaction. */
export async function applyMigrations(sql: Sql, onApplied?: (id: string) => void): Promise<string[]> {
  const pending = await pendingMigrations(sql);
  for (const m of pending) {
    await sql.begin(async (tx) => {
      await tx.unsafe(m.sql);
      await tx`insert into _migrations (id) values (${m.id})`;
    });
    onApplied?.(m.id);
  }
  return pending.map((m) => m.id);
}
