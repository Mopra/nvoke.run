import { q, one } from "../db.js";
import { decryptSecret, encryptSecret, maskPreview } from "../secrets-crypto.js";

export interface SecretSummary {
  id: string;
  function_id: string;
  name: string;
  preview: string;
  created_at: string;
  updated_at: string;
}

interface SecretRow extends SecretSummary {
  value_ct: Buffer;
}

const SUMMARY_COLS =
  "id, function_id, name, preview, created_at, updated_at";

export async function listSecrets(
  functionId: string,
  userId: string,
): Promise<SecretSummary[]> {
  return q<SecretSummary>(
    `SELECT ${SUMMARY_COLS}
       FROM function_secrets
      WHERE function_id=$1 AND user_id=$2
      ORDER BY name ASC`,
    [functionId, userId],
  );
}

export async function createSecret(
  functionId: string,
  userId: string,
  name: string,
  value: string,
): Promise<SecretSummary> {
  const ct = encryptSecret(value);
  const preview = maskPreview(value);
  const row = await one<SecretSummary>(
    `INSERT INTO function_secrets (function_id, user_id, name, value_ct, preview)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING ${SUMMARY_COLS}`,
    [functionId, userId, name, ct, preview],
  );
  return row!;
}

export async function updateSecret(
  id: string,
  functionId: string,
  userId: string,
  patch: { name?: string; value?: string },
): Promise<SecretSummary | null> {
  const ct = patch.value !== undefined ? encryptSecret(patch.value) : null;
  const preview = patch.value !== undefined ? maskPreview(patch.value) : null;
  return one<SecretSummary>(
    `UPDATE function_secrets
        SET name       = COALESCE($4, name),
            value_ct   = COALESCE($5, value_ct),
            preview    = COALESCE($6, preview),
            updated_at = now()
      WHERE id=$1 AND function_id=$2 AND user_id=$3
      RETURNING ${SUMMARY_COLS}`,
    [id, functionId, userId, patch.name ?? null, ct, preview],
  );
}

export const deleteSecret = (
  id: string,
  functionId: string,
  userId: string,
) =>
  q(
    "DELETE FROM function_secrets WHERE id=$1 AND function_id=$2 AND user_id=$3",
    [id, functionId, userId],
  );

export async function loadSecretEnv(
  functionId: string,
): Promise<Record<string, string>> {
  const rows = await q<{ name: string; value_ct: Buffer }>(
    "SELECT name, value_ct FROM function_secrets WHERE function_id=$1",
    [functionId],
  );
  const env: Record<string, string> = {};
  for (const r of rows) {
    try {
      env[r.name] = decryptSecret(r.value_ct);
    } catch {
      // Skip unreadable rows rather than failing the whole invocation.
    }
  }
  return env;
}

export type { SecretRow };
