// The account's own Anthropic key (docs/SPEC.md, "Your own Claude key"),
// sealed with SECRETS_KEY in ai_keys. Only createAi opens it; the routes only
// ever show its last 4 characters.

import type { Sql } from 'postgres';
import type { AiKey } from '@nvoke/shared';
import type { Secrets } from '../crypto/secrets.js';

/** An opened key and the model for each tier. */
export interface OwnKey {
  apiKey: string;
  bulkModel: string;
  qualityModel: string;
}

interface Row {
  sealed_key: string;
  key_last4: string;
  bulk_model: string;
  quality_model: string;
  updated_at: Date;
}

function toAiKey(row: Row): AiKey {
  return {
    provider: 'anthropic',
    last4: row.key_last4,
    bulkModel: row.bulk_model,
    qualityModel: row.quality_model,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getAiKey(sql: Sql, userId: string): Promise<AiKey | null> {
  const [row] = await sql<Row[]>`select * from ai_keys where clerk_user_id = ${userId}`;
  return row ? toAiKey(row) : null;
}

export async function openOwnKey(sql: Sql, secrets: Secrets, userId: string): Promise<OwnKey | null> {
  const [row] = await sql<Row[]>`select * from ai_keys where clerk_user_id = ${userId}`;
  if (!row) return null;
  return { apiKey: secrets.open(row.sealed_key), bulkModel: row.bulk_model, qualityModel: row.quality_model };
}

/** Stores a new key, or with no apiKey changes the models of the stored one (null when there is none). */
export async function saveAiKey(
  sql: Sql,
  secrets: Secrets,
  userId: string,
  input: { apiKey?: string; bulkModel: string; qualityModel: string },
): Promise<AiKey | null> {
  if (!input.apiKey) {
    const [row] = await sql<Row[]>`
      update ai_keys set bulk_model = ${input.bulkModel}, quality_model = ${input.qualityModel}, updated_at = now()
      where clerk_user_id = ${userId} returning *
    `;
    return row ? toAiKey(row) : null;
  }
  const [row] = await sql<Row[]>`
    insert into ai_keys (clerk_user_id, sealed_key, key_last4, bulk_model, quality_model)
    values (${userId}, ${secrets.seal(input.apiKey)}, ${input.apiKey.slice(-4)}, ${input.bulkModel}, ${input.qualityModel})
    on conflict (clerk_user_id) do update set
      sealed_key = excluded.sealed_key, key_last4 = excluded.key_last4,
      bulk_model = excluded.bulk_model, quality_model = excluded.quality_model, updated_at = now()
    returning *
  `;
  return toAiKey(row!);
}

export async function deleteAiKey(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql`delete from ai_keys where clerk_user_id = ${userId}`;
  return rows.count > 0;
}
