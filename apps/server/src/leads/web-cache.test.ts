import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { purge } from './retention.js';
import { dbWebSearchCache } from './web-cache.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate web_search_cache`;
});

const NOW = new Date('2026-10-13T12:00:00Z');
const page = { companies: [{ name: 'Acme', website: 'https://acme.dk', source: 'brave', sourceRef: 'https://acme.dk/' }], more: true };

describe('web search cache', () => {
  it('shares a page between queries that differ only in case and spacing', async () => {
    const cache = dbWebSearchCache(db.sql, () => NOW);
    await cache.put({ q: 'Dentists  Berlin', country: 'de', page: 0 }, page);
    expect(await cache.get({ q: ' dentists berlin ', country: 'de', page: 0 })).toEqual(page);
    expect(await cache.get({ q: 'dentists berlin', page: 0 })).toBeNull();
    expect(await cache.get({ q: 'dentists berlin', country: 'de', page: 1 })).toBeNull();
  });

  it('expires pages after 7 days and purge deletes them', async () => {
    await dbWebSearchCache(db.sql, () => NOW).put({ q: 'x', page: 0 }, page);
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(await dbWebSearchCache(db.sql, () => later).get({ q: 'x', page: 0 })).toBeNull();
    expect((await purge(db.sql, later)).webSearchPages).toBe(1);
  });
});
