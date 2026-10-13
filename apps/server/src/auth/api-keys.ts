// API keys (nvk_sk_...): what the REST API and the MCP server accept from
// scripts and agents. Stored only as a sha256 hash, like device tokens.

import type { Sql, TransactionSql } from 'postgres';
import { API_KEY_PREFIX, API_KEYS_MAX, UNCLAIMED_ACTIVE_DAYS, type ApiKey, type ApiKeyOrigin, type CreateApiKeyResponse } from '@nvoke/shared';
import { randomSecret, sha256Hex } from './crypto.js';

type Db = Sql | TransactionSql;

/** True for strings shaped like our API keys. */
export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/** Characters of a key kept for display: the prefix plus four. */
const DISPLAY_LENGTH = API_KEY_PREFIX.length + 4;

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  origin: ApiKeyOrigin;
  created_at: Date;
  last_used_at: Date | null;
}

function toApiKey(r: ApiKeyRow): ApiKey {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    origin: r.origin,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used_at?.toISOString() ?? null,
  };
}

/** Makes a key. Returns null when the account already holds API_KEYS_MAX live keys. */
export async function createApiKey(
  sql: Db,
  userId: string,
  input: { name: string; origin?: ApiKeyOrigin },
): Promise<CreateApiKeyResponse | null> {
  const key = randomSecret(API_KEY_PREFIX);
  const rows = await sql<ApiKeyRow[]>`
    insert into api_keys (clerk_user_id, name, key_hash, prefix, origin)
    select ${userId}, ${input.name}, ${sha256Hex(key)}, ${key.slice(0, DISPLAY_LENGTH)}, ${input.origin ?? 'user'}
    where (select count(*) from api_keys where clerk_user_id = ${userId} and revoked_at is null) < ${API_KEYS_MAX}
    returning id, name, prefix, origin, created_at, last_used_at
  `;
  return rows[0] ? { ...toApiKey(rows[0]), key } : null;
}

export async function listApiKeys(sql: Db, userId: string): Promise<ApiKey[]> {
  const rows = await sql<ApiKeyRow[]>`
    select id, name, prefix, origin, created_at, last_used_at from api_keys
    where clerk_user_id = ${userId} and revoked_at is null
    order by created_at desc
  `;
  return rows.map(toApiKey);
}

/** Revokes one key. False when the user has no such live key. */
export async function revokeApiKey(sql: Db, userId: string, id: string): Promise<boolean> {
  const rows = await sql`
    update api_keys set revoked_at = now()
    where id = ${id} and clerk_user_id = ${userId} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}

/** Revokes the keys an agent got at sign-up. Returns how many. */
export async function revokeAgentKeys(sql: Db, userId: string): Promise<number> {
  const rows = await sql`
    update api_keys set revoked_at = now()
    where clerk_user_id = ${userId} and origin = 'agent_signup' and revoked_at is null
    returning id
  `;
  return rows.length;
}

export type ResolvedApiKey =
  | { ok: true; keyId: string; userId: string }
  | { ok: false; reason: 'invalid' | 'claim_required' };

/**
 * Resolves a key to its owner. An account an agent created stops answering
 * after UNCLAIMED_ACTIVE_DAYS until a human claims it. last_used_at is
 * written at most once a minute per key.
 */
export async function resolveApiKey(sql: Db, token: string): Promise<ResolvedApiKey> {
  if (!isApiKey(token)) return { ok: false, reason: 'invalid' };
  const rows = await sql<{ id: string; clerk_user_id: string; last_used_at: Date | null; expired: boolean }[]>`
    select k.id, k.clerk_user_id, k.last_used_at,
      (a.claimed_at is null and a.created_at < now() - make_interval(days => ${UNCLAIMED_ACTIVE_DAYS})) as expired
    from api_keys k join accounts a on a.clerk_user_id = k.clerk_user_id
    where k.key_hash = ${sha256Hex(token)} and k.revoked_at is null
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expired) return { ok: false, reason: 'claim_required' };
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60_000) {
    await sql`update api_keys set last_used_at = now() where id = ${row.id}`;
  }
  return { ok: true, keyId: row.id, userId: row.clerk_user_id };
}
