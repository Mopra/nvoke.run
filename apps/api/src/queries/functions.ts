import { q, one, pool } from "../db.js";

export type AccessMode = "public" | "api_key";
export type DependencyMap = Record<string, string>;
export type BuildStatus = "ok" | "error" | null;
export type WebhookVerifyKind = "none" | "stripe" | "github" | "hmac_sha256";

export const SUPPORTED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type HttpMethod = (typeof SUPPORTED_METHODS)[number];

export interface FnRow {
  id: string;
  user_id: string;
  name: string;
  code: string;
  slug: string | null;
  access_mode: AccessMode;
  enabled: boolean;
  dependencies: DependencyMap;
  bundled_code: string | null;
  build_status: BuildStatus;
  build_error: string | null;
  built_at: string | null;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
  webhook_verify_kind: WebhookVerifyKind;
  webhook_secret_preview: string | null;
  webhook_signature_header: string | null;
}

export interface Fn extends FnRow {
  methods: HttpMethod[];
}

export interface FunctionVersion {
  id: string;
  function_id: string;
  version_number: number;
  code: string;
  created_at: string;
}

const FN_COLS =
  "id, user_id, name, code, slug, access_mode, enabled, dependencies, bundled_code, build_status, build_error, built_at, created_at, updated_at, current_version_id, webhook_verify_kind, webhook_secret_preview, webhook_signature_header";

async function attachMethods(rows: FnRow[]): Promise<Fn[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const methodRows = await q<{ function_id: string; method: HttpMethod }>(
    `SELECT function_id, method FROM function_http_methods
     WHERE function_id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map<string, HttpMethod[]>();
  for (const m of methodRows) {
    const list = byId.get(m.function_id) ?? [];
    list.push(m.method);
    byId.set(m.function_id, list);
  }
  return rows.map((r) => ({ ...r, methods: byId.get(r.id) ?? [] }));
}

export async function listFunctions(userId: string): Promise<Fn[]> {
  const rows = await q<FnRow>(
    `SELECT ${FN_COLS} FROM functions WHERE user_id=$1 ORDER BY created_at DESC`,
    [userId],
  );
  return attachMethods(rows);
}

export async function getFunction(id: string, userId: string): Promise<Fn | null> {
  const row = await one<FnRow>(
    `SELECT ${FN_COLS} FROM functions WHERE id=$1 AND user_id=$2`,
    [id, userId],
  );
  if (!row) return null;
  const [withMethods] = await attachMethods([row]);
  return withMethods;
}

export async function getFunctionBySlug(slug: string): Promise<Fn | null> {
  const row = await one<FnRow>(
    `SELECT ${FN_COLS} FROM functions WHERE slug=$1`,
    [slug],
  );
  if (!row) return null;
  const [withMethods] = await attachMethods([row]);
  return withMethods;
}

async function replaceMethods(
  client: { query: typeof pool.query },
  functionId: string,
  methods: HttpMethod[],
) {
  await client.query("DELETE FROM function_http_methods WHERE function_id=$1", [
    functionId,
  ]);
  if (methods.length === 0) return;
  const values = methods.map((_, i) => `($1, $${i + 2})`).join(",");
  await client.query(
    `INSERT INTO function_http_methods (function_id, method) VALUES ${values}
     ON CONFLICT DO NOTHING`,
    [functionId, ...methods],
  );
}

export interface CreateFunctionInput {
  name: string;
  code: string;
  slug?: string | null;
  access_mode?: AccessMode;
  enabled?: boolean;
  methods?: HttpMethod[];
  dependencies?: DependencyMap;
}

export async function createFunction(
  userId: string,
  input: CreateFunctionInput,
): Promise<Fn> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<FnRow>(
      `INSERT INTO functions (user_id, name, code, slug, access_mode, enabled, dependencies)
       VALUES ($1,$2,$3,$4,COALESCE($5,'api_key'),COALESCE($6,true),COALESCE($7::jsonb,'{}'::jsonb))
       RETURNING ${FN_COLS}`,
      [
        userId,
        input.name,
        input.code,
        input.slug ?? null,
        input.access_mode ?? null,
        input.enabled ?? null,
        input.dependencies ? JSON.stringify(input.dependencies) : null,
      ],
    );
    const row = res.rows[0];
    const methods = input.methods && input.methods.length > 0 ? input.methods : ["POST" as HttpMethod];
    await replaceMethods(client, row.id, methods);
    const versionRes = await client.query<{ id: string }>(
      `INSERT INTO function_versions (function_id, version_number, code)
       VALUES ($1, 1, $2) RETURNING id`,
      [row.id, input.code],
    );
    const versionId = versionRes.rows[0].id;
    await client.query(
      `UPDATE functions SET current_version_id=$2 WHERE id=$1`,
      [row.id, versionId],
    );
    await client.query("COMMIT");
    return { ...row, current_version_id: versionId, methods };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface UpdateFunctionInput {
  name?: string;
  code?: string;
  slug?: string | null;
  access_mode?: AccessMode;
  enabled?: boolean;
  methods?: HttpMethod[];
  dependencies?: DependencyMap;
}

export async function updateFunction(
  id: string,
  userId: string,
  patch: UpdateFunctionInput,
): Promise<Fn | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prior = await client.query<{ code: string }>(
      `SELECT code FROM functions WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [id, userId],
    );
    if (prior.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const res = await client.query<FnRow>(
      `UPDATE functions
         SET name         = COALESCE($3, name),
             code         = COALESCE($4, code),
             slug         = CASE WHEN $6::boolean THEN $5 ELSE slug END,
             access_mode  = COALESCE($7, access_mode),
             enabled      = COALESCE($8, enabled),
             dependencies = COALESCE($9::jsonb, dependencies),
             updated_at   = now()
       WHERE id=$1 AND user_id=$2
       RETURNING ${FN_COLS}`,
      [
        id,
        userId,
        patch.name ?? null,
        patch.code ?? null,
        patch.slug ?? null,
        patch.slug !== undefined,
        patch.access_mode ?? null,
        patch.enabled ?? null,
        patch.dependencies ? JSON.stringify(patch.dependencies) : null,
      ],
    );
    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    if (patch.methods) {
      await replaceMethods(client, id, patch.methods);
    }
    if (patch.code !== undefined && patch.code !== prior.rows[0].code) {
      const nextVersion = await client.query<{ id: string }>(
        `INSERT INTO function_versions (function_id, version_number, code)
         VALUES ($1,
                 COALESCE((SELECT MAX(version_number) FROM function_versions WHERE function_id=$1), 0) + 1,
                 $2)
         RETURNING id`,
        [id, patch.code],
      );
      const versionId = nextVersion.rows[0].id;
      await client.query(
        `UPDATE functions SET current_version_id=$2 WHERE id=$1`,
        [id, versionId],
      );
      row.current_version_id = versionId;
    }
    await client.query("COMMIT");
    const [withMethods] = await attachMethods([row]);
    return withMethods;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export const deleteFunction = (id: string, userId: string) =>
  q("DELETE FROM functions WHERE id=$1 AND user_id=$2", [id, userId]);

export type RunnableCode =
  | { ok: true; code: string }
  | { ok: false; error: string };

export function runnableCode(fn: Pick<Fn, "code" | "dependencies" | "bundled_code" | "build_status" | "build_error">): RunnableCode {
  const hasDeps = Object.keys(fn.dependencies ?? {}).length > 0;
  if (!hasDeps) return { ok: true, code: fn.code };
  if (fn.bundled_code) return { ok: true, code: fn.bundled_code };
  return {
    ok: false,
    error: fn.build_error
      ? `function build failed: ${fn.build_error}`
      : "function dependencies have not been built yet",
  };
}

export async function recordBuildResult(
  id: string,
  result: { ok: true; bundled: string } | { ok: false; error: string },
): Promise<void> {
  if (result.ok) {
    await q(
      `UPDATE functions
          SET bundled_code=$2,
              build_status='ok',
              build_error=NULL,
              built_at=now()
        WHERE id=$1`,
      [id, result.bundled],
    );
  } else {
    await q(
      `UPDATE functions
          SET bundled_code=NULL,
              build_status='error',
              build_error=$2,
              built_at=now()
        WHERE id=$1`,
      [id, result.error],
    );
  }
}

export async function listVersions(
  functionId: string,
  userId: string,
): Promise<FunctionVersion[] | null> {
  const owner = await one<{ id: string }>(
    `SELECT id FROM functions WHERE id=$1 AND user_id=$2`,
    [functionId, userId],
  );
  if (!owner) return null;
  return q<FunctionVersion>(
    `SELECT id, function_id, version_number, code, created_at
       FROM function_versions
      WHERE function_id=$1
      ORDER BY version_number DESC`,
    [functionId],
  );
}

export interface WebhookVerifyConfig {
  kind: WebhookVerifyKind;
  secret_ct: Buffer | null;
  signature_header: string | null;
}

export const getWebhookVerifyConfig = (functionId: string) =>
  one<WebhookVerifyConfig>(
    `SELECT webhook_verify_kind AS kind,
            webhook_secret_ct  AS secret_ct,
            webhook_signature_header AS signature_header
       FROM functions WHERE id=$1`,
    [functionId],
  );

export async function setWebhookVerify(
  functionId: string,
  userId: string,
  input: {
    kind: WebhookVerifyKind;
    secret_ct: Buffer | null;
    secret_preview: string | null;
    signature_header: string | null;
  },
): Promise<Fn | null> {
  const row = await one<FnRow>(
    `UPDATE functions
        SET webhook_verify_kind     = $3,
            webhook_secret_ct       = $4,
            webhook_secret_preview  = $5,
            webhook_signature_header= $6,
            updated_at              = now()
      WHERE id=$1 AND user_id=$2
      RETURNING ${FN_COLS}`,
    [
      functionId,
      userId,
      input.kind,
      input.secret_ct,
      input.secret_preview,
      input.signature_header,
    ],
  );
  if (!row) return null;
  const [withMethods] = await attachMethods([row]);
  return withMethods;
}

export async function rollbackToVersion(
  functionId: string,
  userId: string,
  versionId: string,
): Promise<Fn | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const version = await client.query<{ code: string }>(
      `SELECT v.code FROM function_versions v
         JOIN functions f ON f.id = v.function_id
        WHERE v.id=$1 AND v.function_id=$2 AND f.user_id=$3`,
      [versionId, functionId, userId],
    );
    if (version.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const res = await client.query<FnRow>(
      `UPDATE functions
          SET code=$3,
              current_version_id=$2,
              updated_at=now()
        WHERE id=$1 AND user_id=$4
        RETURNING ${FN_COLS}`,
      [functionId, versionId, version.rows[0].code, userId],
    );
    await client.query("COMMIT");
    const [withMethods] = await attachMethods([res.rows[0]]);
    return withMethods;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
