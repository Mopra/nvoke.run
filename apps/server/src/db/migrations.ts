import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export interface Migration {
  id: string;
  sql: string;
}

/**
 * The first line that takes a file out of the per file transaction, for what
 * a transaction cannot hold: `create index concurrently`, or a `do` block
 * that commits a long backfill in batches. Its statements run one by one on
 * one connection, and a failure leaves the ones before it applied, so such a
 * file must be safe to run again (`if not exists`, `where ... is null`).
 */
export const NO_TRANSACTION = '-- migrate: no transaction';

const isNoTransaction = (m: Migration): boolean => m.sql.trimStart().split(/\r?\n/, 1)[0]?.trim() === NO_TRANSACTION;

/**
 * The statements of a SQL file, split at the semicolons outside quotes,
 * comments and dollar quoted bodies. Comment only pieces are dropped.
 */
export function splitStatements(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const push = (end: number) => {
    const stmt = text.slice(start, end).trim();
    if (stmt.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim()) out.push(stmt);
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl + 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (ch === "'" || ch === '"') {
      // A doubled quote inside is an escaped one: the loop reads it as a close and a new open.
      const end = text.indexOf(ch, i + 1);
      i = end < 0 ? text.length : end + 1;
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i))?.[0];
      if (tag) {
        const end = text.indexOf(tag, i + tag.length);
        i = end < 0 ? text.length : end + tag.length;
      } else i++;
    } else if (ch === ';') {
      push(i);
      start = ++i;
    } else i++;
  }
  push(text.length);
  return out;
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
  // Keep the bookkeeping table out of the Supabase REST API too.
  await sql`alter table _migrations enable row level security`;
  const applied = new Set((await sql<{ id: string }[]>`select id from _migrations`).map((r) => r.id));
  return all.filter((m) => !applied.has(m.id));
}

/**
 * Applies every pending migration in filename order, each in its own
 * transaction, or statement by statement when it starts with NO_TRANSACTION.
 */
export async function applyMigrations(sql: Sql, onApplied?: (id: string) => void, all?: Migration[]): Promise<string[]> {
  const pending = await pendingMigrations(sql, all);
  for (const m of pending) {
    if (isNoTransaction(m)) {
      const conn = await sql.reserve();
      try {
        for (const stmt of splitStatements(m.sql)) await conn.unsafe(stmt);
        await conn`insert into _migrations (id) values (${m.id})`;
      } finally {
        // A `set` in the file stays with the session: the pool gets it back clean.
        await conn`reset all`.catch(() => {});
        conn.release();
      }
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`insert into _migrations (id) values (${m.id})`;
      });
    }
    onApplied?.(m.id);
  }
  return pending.map((m) => m.id);
}
