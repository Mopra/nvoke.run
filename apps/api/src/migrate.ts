import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(log: (msg: string) => void = () => {}): Promise<number> {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    const { rowCount } = await pool.query("SELECT 1 FROM _migrations WHERE name=$1", [f]);
    if (rowCount) continue;
    const sql = await readFile(join(dir, f), "utf8");
    log(`applying ${f}`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO _migrations(name) VALUES ($1)", [f]);
      await pool.query("COMMIT");
      applied++;
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
  return applied;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrate.js") ||
  process.argv[1]?.endsWith("migrate.ts");

if (isMain) {
  runMigrations((msg) => console.log(msg))
    .then(async (applied) => {
      console.log(`migrations done (${applied} applied)`);
      await pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
