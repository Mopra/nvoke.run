// The account's own search key (docs/SPEC.md, "Your own search key"), sealed
// with SECRETS_KEY in search_keys. Only the search client opens it; the
// routes only ever show its last 4 characters.

import type { Sql } from 'postgres';
import type { SearchKey, SearchKeyProvider } from '@nvoke/shared';
import type { Secrets } from '../crypto/secrets.js';

/** An opened key and the engine it is for. */
export interface OwnSearchKey {
  provider: SearchKeyProvider;
  apiKey: string;
}

interface Row {
  provider: SearchKeyProvider;
  sealed_key: string;
  key_last4: string;
  updated_at: Date;
}

const toSearchKey = (row: Row): SearchKey => ({ provider: row.provider, last4: row.key_last4, updatedAt: row.updated_at.toISOString() });

export async function getSearchKey(sql: Sql, userId: string): Promise<SearchKey | null> {
  const [row] = await sql<Row[]>`select * from search_keys where clerk_user_id = ${userId}`;
  return row ? toSearchKey(row) : null;
}

export async function hasSearchKey(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql`select 1 from search_keys where clerk_user_id = ${userId}`;
  return rows.length > 0;
}

export async function openSearchKey(sql: Sql, secrets: Secrets, userId: string): Promise<OwnSearchKey | null> {
  const [row] = await sql<Row[]>`select * from search_keys where clerk_user_id = ${userId}`;
  return row ? { provider: row.provider, apiKey: secrets.open(row.sealed_key) } : null;
}

export async function saveSearchKey(sql: Sql, secrets: Secrets, userId: string, input: OwnSearchKey): Promise<SearchKey> {
  const [row] = await sql<Row[]>`
    insert into search_keys (clerk_user_id, provider, sealed_key, key_last4)
    values (${userId}, ${input.provider}, ${secrets.seal(input.apiKey)}, ${input.apiKey.slice(-4)})
    on conflict (clerk_user_id) do update set
      provider = excluded.provider, sealed_key = excluded.sealed_key, key_last4 = excluded.key_last4, updated_at = now()
    returning *
  `;
  return toSearchKey(row!);
}

export async function deleteSearchKey(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql`delete from search_keys where clerk_user_id = ${userId}`;
  return rows.count > 0;
}
