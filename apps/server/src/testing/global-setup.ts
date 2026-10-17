// Vitest global setup: a Postgres for the database tests.
//
// With TEST_DATABASE_URL set (any Postgres 14+ where the user may create
// databases), that server is used. Otherwise an embedded Postgres is started
// from the embedded-postgres package (real Postgres binaries, works on
// Windows, macOS and Linux without Docker) in a temp directory on a free port.
//
// Migrations are applied once to a template database; every test file then
// gets its own copy (see db.ts), so files can run in parallel.

import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { applyMigrations } from '../db/migrations.js';

export const TEMPLATE_DB = 'nvoke_test_template';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let adminUrl = process.env.TEST_DATABASE_URL;
  let teardown: () => Promise<void> = async () => {};

  if (!adminUrl) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dir = mkdtempSync(join(tmpdir(), 'nvoke-pg-'));
    const port = await freePort();
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      port,
      user: 'postgres',
      password: 'postgres',
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
    teardown = async () => {
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
  await admin.unsafe(`create database ${TEMPLATE_DB} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
  await admin.end();

  const template = postgres(withDatabase(adminUrl, TEMPLATE_DB), { max: 1, onnotice: () => {} });
  await applyMigrations(template);
  await template.end();

  project.provide('pgAdminUrl', adminUrl);
  return teardown;
}
