import { randomBytes } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { inject } from 'vitest';
import { TEMPLATE_DB, withDatabase } from './global-setup.js';

export interface TestDb {
  sql: Sql;
  url: string;
  drop(): Promise<void>;
}

/** A fresh database with every migration applied, private to the calling test file. */
export async function createTestDb(): Promise<TestDb> {
  const adminUrl = inject('pgAdminUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name} template ${TEMPLATE_DB}`);
  await admin.end();

  const url = withDatabase(adminUrl, name);
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return {
    sql,
    url,
    async drop() {
      await sql.end({ timeout: 5 });
      const a = postgres(adminUrl, { max: 1, onnotice: () => {} });
      await a.unsafe(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
