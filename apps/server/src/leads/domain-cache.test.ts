import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FoundPerson } from '@nvoke/shared/crawl';
import { createTestDb, type TestDb } from '../testing/db.js';
import { cachedCrawl, recentPeopleRead, recordCrawl } from './domain-cache.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate domains cascade`;
});

const NOW = new Date('2026-10-17T12:00:00Z');
const person = (firstName: string, lastName: string, title: string | null, seniority: FoundPerson['seniority']): FoundPerson => ({
  firstName,
  lastName,
  title,
  seniority,
  sourceUrl: 'https://acme.dk/team',
});

describe('domain cache people', () => {
  it('keeps the people of a crawl in order and serves them on a cache hit', async () => {
    const people = [person('Mette', 'Hansen', 'CEO', 'founder'), person('Jonas', 'Berg', 'Designer', 'staff'), person('mette', 'hansen', null, null)];
    await db.sql.begin((tx) =>
      recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: false, generic: [{ address: 'info@acme.dk', sourceUrl: null }], people }, NOW),
    );
    const hit = await cachedCrawl(db.sql, 'acme.dk', NOW);
    expect(hit?.emails).toEqual([{ address: 'info@acme.dk', sourceUrl: null }]);
    expect(hit?.people).toEqual([person('Mette', 'Hansen', 'CEO', 'founder'), person('Jonas', 'Berg', 'Designer', 'staff')]);
  });

  it('replaces them on the next crawl, and leaves them when a crawl brings none', async () => {
    await db.sql.begin((tx) => recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: false, generic: [], people: [person('Ole', 'Berg', 'Partner', 'founder')] }, NOW));
    await db.sql.begin((tx) => recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: false, generic: [] }, NOW));
    expect((await cachedCrawl(db.sql, 'acme.dk', NOW))?.people.map((p) => p.firstName)).toEqual(['Ole']);
    await db.sql.begin((tx) => recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: false, generic: [], people: [] }, NOW));
    expect((await cachedCrawl(db.sql, 'acme.dk', NOW))?.people).toEqual([]);
  });

  it('remembers for 90 days that Claude read the people pages, and keeps it across crawls that did not', async () => {
    expect(await recentPeopleRead(db.sql, 'acme.dk', NOW)).toBeNull();
    const people = [person('Ole', 'Berg', 'Partner', 'founder')];
    await db.sql.begin((tx) => recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: true, generic: [], people, peopleRead: true }, NOW));
    const later = new Date(NOW.getTime() + 30 * 86_400_000);
    await db.sql.begin((tx) => recordCrawl(tx, 'acme.dk', { status: 'done', hasPersonal: true, generic: [], people }, later));
    expect((await recentPeopleRead(db.sql, 'acme.dk', later))?.map((p) => p.firstName)).toEqual(['Ole']);
    expect(await recentPeopleRead(db.sql, 'acme.dk', new Date(NOW.getTime() + 91 * 86_400_000))).toBeNull();
  });
});
