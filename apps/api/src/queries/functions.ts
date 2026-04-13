import { q, one, pool } from "../db.js";

export type AccessMode = "public" | "api_key";

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
  created_at: string;
  updated_at: string;
}

export interface Fn extends FnRow {
  methods: HttpMethod[];
}

const FN_COLS =
  "id, user_id, name, code, slug, access_mode, enabled, created_at, updated_at";

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
}

export async function createFunction(
  userId: string,
  input: CreateFunctionInput,
): Promise<Fn> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<FnRow>(
      `INSERT INTO functions (user_id, name, code, slug, access_mode, enabled)
       VALUES ($1,$2,$3,$4,COALESCE($5,'api_key'),COALESCE($6,true))
       RETURNING ${FN_COLS}`,
      [
        userId,
        input.name,
        input.code,
        input.slug ?? null,
        input.access_mode ?? null,
        input.enabled ?? null,
      ],
    );
    const row = res.rows[0];
    const methods = input.methods && input.methods.length > 0 ? input.methods : ["POST" as HttpMethod];
    await replaceMethods(client, row.id, methods);
    await client.query("COMMIT");
    return { ...row, methods };
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
}

export async function updateFunction(
  id: string,
  userId: string,
  patch: UpdateFunctionInput,
): Promise<Fn | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<FnRow>(
      `UPDATE functions
         SET name        = COALESCE($3, name),
             code        = COALESCE($4, code),
             slug        = CASE WHEN $6::boolean THEN $5 ELSE slug END,
             access_mode = COALESCE($7, access_mode),
             enabled     = COALESCE($8, enabled),
             updated_at  = now()
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
