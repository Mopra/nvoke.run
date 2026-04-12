import { q, one } from "../db.js";

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  last_used_at: string | null;
  created_at: string;
}

export type ApiKeySummary = Omit<ApiKey, "key_hash">;

export const listKeys = (userId: string) =>
  q<ApiKeySummary>(
    `SELECT id, user_id, name, prefix, last_used_at, created_at
     FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC`,
    [userId],
  );

export const insertKey = (
  userId: string,
  name: string,
  prefix: string,
  keyHash: string,
) =>
  one<ApiKey>(
    "INSERT INTO api_keys (user_id, name, prefix, key_hash) VALUES ($1,$2,$3,$4) RETURNING *",
    [userId, name, prefix, keyHash],
  );

export const deleteKey = (id: string, userId: string) =>
  q("DELETE FROM api_keys WHERE id=$1 AND user_id=$2", [id, userId]);

export const findByHash = (keyHash: string) =>
  one<ApiKey>("SELECT * FROM api_keys WHERE key_hash=$1", [keyHash]);

export const touchKey = (id: string) =>
  q("UPDATE api_keys SET last_used_at=now() WHERE id=$1", [id]);
